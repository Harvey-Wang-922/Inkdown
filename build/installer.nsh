!include "FileAssociation.nsh"
!include "nsDialogs.nsh"

!define INKDOWN_CAPABILITIES "Software\Inkdown\Capabilities"
!define INKDOWN_DOCUMENT_ICON "$INSTDIR\resources\assets\markdown-file.ico"

!macro InkdownProgId EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\Inkdown.${EXT}" "" "Markdown 文档"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Inkdown.${EXT}" "AppUserModelID" "${APP_ID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Inkdown.${EXT}\DefaultIcon" "" "${INKDOWN_DOCUMENT_ICON}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Inkdown.${EXT}\shell\open\command" "" '$appExe $\"%1$\"'
  WriteRegNone SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Inkdown.${EXT}"
  WriteRegStr SHELL_CONTEXT "${INKDOWN_CAPABILITIES}\FileAssociations" ".${EXT}" "Inkdown.${EXT}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Inkdown.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro InkdownSetDefault EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}" "" "Inkdown.${EXT}"
!macroend

!macro InkdownClearDefault EXT
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  ${If} $0 == "Inkdown.${EXT}"
    DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  ${EndIf}
!macroend

!macro InkdownMigrateLegacyExtension EXT
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.${EXT}" ""
  ${If} $0 == "Inkdown.Markdown"
    !insertmacro InkdownSetDefault "${EXT}"
  ${EndIf}
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Inkdown.Markdown"
!macroend

!macro InkdownRemoveExtension EXT
  !insertmacro InkdownClearDefault "${EXT}"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "Inkdown.${EXT}"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Inkdown.${EXT}"
!macroend

!macro InkdownRegisterApplication
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Inkdown.exe" "" "Inkdown"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Inkdown.exe" "AppUserModelID" "${APP_ID}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Inkdown.exe\DefaultIcon" "" "${INKDOWN_DOCUMENT_ICON}"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\Inkdown.exe\shell\open\command" "" '$appExe $\"%1$\"'
  WriteRegStr SHELL_CONTEXT "${INKDOWN_CAPABILITIES}" "ApplicationName" "Inkdown"
  WriteRegStr SHELL_CONTEXT "${INKDOWN_CAPABILITIES}" "ApplicationDescription" "本地优先的 Markdown 编辑器"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "Inkdown" "${INKDOWN_CAPABILITIES}"
  !insertmacro InkdownProgId "md"
  !insertmacro InkdownProgId "markdown"
  !insertmacro InkdownProgId "mdown"
  !insertmacro InkdownProgId "mkd"
  !insertmacro InkdownProgId "mkdn"
  !insertmacro InkdownMigrateLegacyExtension "md"
  !insertmacro InkdownMigrateLegacyExtension "markdown"
  !insertmacro InkdownMigrateLegacyExtension "mdown"
  !insertmacro InkdownMigrateLegacyExtension "mkd"
  !insertmacro InkdownMigrateLegacyExtension "mkdn"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Inkdown.Markdown"
!macroend

!macro InkdownRemoveApplication
  !insertmacro InkdownRemoveExtension "md"
  !insertmacro InkdownRemoveExtension "markdown"
  !insertmacro InkdownRemoveExtension "mdown"
  !insertmacro InkdownRemoveExtension "mkd"
  !insertmacro InkdownRemoveExtension "mkdn"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\Inkdown.exe"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "Inkdown"
  DeleteRegKey SHELL_CONTEXT "Software\Inkdown"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Inkdown.Markdown"
  !insertmacro UPDATEFILEASSOC
!macroend

!ifndef BUILD_UNINSTALLER
  Var MarkdownAssociationCheckbox
  Var MarkdownAssociationRequested

  Function MarkdownAssociationPageCreate
    ${If} ${Silent}
      Abort
    ${EndIf}
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 34u "Markdown 文件关联（可选）。安装后不会自动打开系统设置；如 Windows 要求确认，请自行通过“打开方式”或默认应用设置选择 Inkdown。"
    Pop $0
    ${NSD_CreateCheckbox} 0 46u 100% 18u "将 Inkdown 配置为 Markdown 文件的默认打开程序"
    Pop $MarkdownAssociationCheckbox

    ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.md" ""
    ${If} $0 == "Inkdown.md"
      ${NSD_Check} $MarkdownAssociationCheckbox
    ${ElseIf} $0 == "Inkdown.Markdown"
      ${NSD_Check} $MarkdownAssociationCheckbox
    ${Else}
      ${NSD_Uncheck} $MarkdownAssociationCheckbox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function MarkdownAssociationPageLeave
    ${NSD_GetState} $MarkdownAssociationCheckbox $MarkdownAssociationRequested
  FunctionEnd

  !macro customPageAfterChangeDir
    Page custom MarkdownAssociationPageCreate MarkdownAssociationPageLeave
  !macroend

  !macro customInstall
    !insertmacro InkdownRegisterApplication
    ${IfNot} ${Silent}
      ${If} $MarkdownAssociationRequested == ${BST_CHECKED}
        !insertmacro InkdownSetDefault "md"
        !insertmacro InkdownSetDefault "markdown"
        !insertmacro InkdownSetDefault "mdown"
        !insertmacro InkdownSetDefault "mkd"
        !insertmacro InkdownSetDefault "mkdn"
        !insertmacro UPDATEFILEASSOC
      ${Else}
        !insertmacro InkdownClearDefault "md"
        !insertmacro InkdownClearDefault "markdown"
        !insertmacro InkdownClearDefault "mdown"
        !insertmacro InkdownClearDefault "mkd"
        !insertmacro InkdownClearDefault "mkdn"
        !insertmacro UPDATEFILEASSOC
      ${EndIf}
    ${EndIf}
  !macroend
!else
  !macro customUnInstall
    ${IfNot} ${isUpdated}
      !insertmacro InkdownRemoveApplication
    ${EndIf}
  !macroend
!endif
