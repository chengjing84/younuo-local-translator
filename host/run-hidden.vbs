Option Explicit
Dim shell, fso, scriptDir, launcher
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcher = fso.BuildPath(scriptDir, "launch-hidden.cmd")
shell.CurrentDirectory = scriptDir
shell.Run """" & launcher & """", 0, False
