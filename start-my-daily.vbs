Option Explicit

Dim shell, attempt, command
Set shell = CreateObject("WScript.Shell")

If Not IsAppRunning() Then
  command = "cmd.exe /c cd /d ""C:\Users\rhuser\Desktop\app"" && node server.mjs"
  shell.Run command, 0, False
End If

For attempt = 1 To 40
  If IsAppRunning() Then Exit For
  WScript.Sleep 500
Next

If IsAppRunning() Then
  shell.Run "http://127.0.0.1:4173/", 1, False
Else
  MsgBox "The local server did not start. Check that Node.js is installed and the project files are present.", vbExclamation, "My Daily"
End If

Function IsAppRunning()
  Dim request
  IsAppRunning = False
  On Error Resume Next
  Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
  If Err.Number = 0 Then
    request.SetTimeouts 500, 500, 500, 500
    request.Open "GET", "http://127.0.0.1:4173/", False
    request.Send
    If Err.Number = 0 Then
      If request.Status >= 200 And request.Status < 500 Then IsAppRunning = True
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Function
