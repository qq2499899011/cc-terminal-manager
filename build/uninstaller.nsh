!macro customUnInstall
  ; Clean up hook entries from ~/.claude/settings.json on uninstall
  ExecWait '"$INSTDIR\resources\hook-bin\cc-hook.exe" --uninstall-hooks'
!macroend
