"""Tests for Windows-specific dangerous-command patterns.

These patterns are approval-gated (not hardline): they trigger an approval
prompt but can be bypassed with --yolo. They cover Windows-specific
operations that the POSIX-focused DANGEROUS_PATTERNS list misses:

  - Registry modifications (reg.exe, regedit /s, PowerShell HKLM: cmdlets)
  - Service management (sc.exe, PowerShell Set/Stop/New/Remove-Service)
  - Scheduled task management (schtasks /create, /delete, /change, /end)
  - User/group management (net user /delete, net localgroup /add)
  - Boot config modification (bcdedit /set)
  - Disk partition management (diskpart delete/remove/format)
  - Ownership/ACL changes on system files (takeown, icacls on C:\\Windows)

Hardline (unrecoverable) Windows patterns (diskpart clean, format X:,
Stop/Restart-Computer, reg delete on root hives) are tested in
test_hardline_blocklist.py.
"""

import pytest

from tools.approval import detect_dangerous_command


# Windows commands that MUST trigger dangerous-command detection.
_WIN_DANGEROUS = [
    # reg.exe modifications
    "reg add HKCU\\Software\\MyApp /v foo /t REG_SZ /d bar /f",
    "reg delete HKLM\\SOFTWARE\\MyApp /f",
    "reg delete HKCU\\Software\\MyApp /v foo /f",
    "reg import C:\\Users\\admin\\Desktop\\evil.reg",
    "reg copy HKLM\\SOFTWARE\\MyApp HKLM\\SOFTWARE\\MyApp2 /s /f",
    "reg restore HKLM\\SOFTWARE\\MyApp C:\\backup\\myapp.bak",
    "reg load HKLM\\MyHive C:\\Users\\admin\\Desktop\\hive.dat",
    "reg unload HKLM\\MyHive",
    "reg.exe add HKCU\\Software\\Test /v key /t REG_SZ /d value /f",
    # regedit /s (silent import)
    "regedit /s C:\\Users\\admin\\Desktop\\evil.reg",
    "regedit.exe /s import.reg",
    # sc.exe service modifications
    "sc create MyService binPath= C:\\evil.exe",
    "sc delete MyService",
    "sc config MyService start= auto",
    "sc stop MyService",
    "sc start MyService",
    "sc.exe delete MyService",
    # schtasks scheduled task modifications
    "schtasks /create /tn EvilTask /tr C:\\evil.exe /sc daily",
    "schtasks /delete /tn MyTask /f",
    "schtasks /change /tn MyTask /tr C:\\new.exe",
    "schtasks /end /tn RunningTask",
    # net user / localgroup
    "net user TestUser /delete",
    "net user NewUser Password123 /add",
    "net localgroup administrators EvilUser /add",
    "net localgroup administrators SomeUser /delete",
    # bcdedit /set
    "bcdedit /set {default} recoveryenabled no",
    "bcdedit /set bootstatuspolicy ignoreallfailures",
    "bcdedit.exe /set {current} safeboot minimal",
    # diskpart destructive (non-clean)
    "echo delete partition | diskpart",
    "echo delete volume | diskpart",
    "echo remove letter=Z | diskpart",
    # takeown on Windows system files
    "takeown /F C:\\Windows\\System32\\evil.dll",
    "takeown /f C:\\Windows\\explorer.exe /a /r /d y",
    # icacls granting on Windows system files
    "icacls C:\\Windows\\System32 /grant Everyone:F",
    "icacls C:\\Windows /grant Users:(OI)(CI)F /t",
    # PowerShell HKLM registry operations
    "powershell -Command \"Set-ItemProperty -Path HKLM:\\SOFTWARE\\MyApp -Name foo -Value bar\"",
    "powershell -Command \"Remove-Item -Path HKLM:\\SOFTWARE\\EvilKey -Recurse\"",
    "powershell -Command \"New-ItemProperty -Path HKLM:\\SOFTWARE\\MyApp -Name newkey -Value 1\"",
    "pwsh -c \"Set-ItemProperty HKLM:\\SYSTEM\\CurrentControlSet\\Services\\MyService ImagePath C:\\evil.exe\"",
    # PowerShell service operations
    "powershell -Command \"Set-Service -Name Spooler -StartupType Disabled\"",
    "powershell -Command \"New-Service -Name Evil -BinaryPathName C:\\evil.exe\"",
    "powershell -Command \"Stop-Service -Name Spooler -Force\"",
    "powershell -Command \"Remove-Service -Name MyService\"",
]


# Windows commands that look similar but must NOT trigger dangerous detection.
# These are read-only / benign operations.
_WIN_DANGEROUS_ALLOW = [
    # reg query / export (read-only)
    "reg query HKLM\\SOFTWARE\\Microsoft",
    "reg query HKCU\\Software /s",
    "reg export HKLM\\SOFTWARE C:\\backup.reg",
    "reg.exe query HKLM\\SOFTWARE",
    # regedit without /s (shows GUI, interactive)
    "regedit C:\\file.reg",
    "regedit.exe C:\\file.reg",
    # sc.exe query (read-only)
    "sc query",
    "sc query type= service",
    "sc queryex MyService",
    "sc.exe query",
    # schtasks /query (read-only)
    "schtasks /query",
    "schtasks /query /fo LIST /v",
    # net user without /delete or /add (lists users)
    "net user",
    "net user TestUser",
    "net localgroup",
    "net localgroup administrators",
    # bcdedit without /set (read-only)
    "bcdedit /enum",
    "bcdedit /default {current}",
    "bcdedit /store C:\\BCD /enum",
    # diskpart list/detail (read-only)
    "diskpart list disk",
    "diskpart list volume",
    "diskpart detail disk 0",
    "diskpart /list",
    # takeown on non-system paths
    "takeown /F C:\\Users\\admin\\file.txt",
    "takeown /f .\\local_file",
    # icacls on non-system paths
    "icacls C:\\Users\\admin\\file.txt /grant Users:F",
    "icacls .\\file.txt /grant Everyone:R",
    # PowerShell read-only cmdlets
    "powershell -Command \"Get-Service\"",
    "powershell -Command \"Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\"",
    "powershell -Command \"Get-ChildItem HKLM:\\SOFTWARE\"",
    "powershell -Command \"Get-Service -Name Spooler\"",
    # PowerShell service operations on non-HKLM paths
    "powershell -Command \"Set-ItemProperty -Path HKCU:\\Software\\MyApp -Name foo -Value bar\"",
    "powershell -Command \"Remove-Item -Path HKCU:\\Software\\MyApp\"",
]


@pytest.mark.parametrize("command", _WIN_DANGEROUS)
def test_windows_dangerous_detected(command):
    """Windows-specific dangerous commands must be detected."""
    is_dangerous, pattern_key, desc = detect_dangerous_command(command)
    assert is_dangerous, f"expected dangerous detection for {command!r}"
    assert desc, "dangerous match must provide a description"


@pytest.mark.parametrize("command", _WIN_DANGEROUS_ALLOW)
def test_windows_dangerous_not_detected(command):
    """Benign Windows commands must NOT trigger dangerous detection."""
    is_dangerous, pattern_key, desc = detect_dangerous_command(command)
    assert not is_dangerous, (
        f"expected NO dangerous detection for {command!r} (got: {desc})"
    )
