!macro _RegisterSessionBoxBrowser ROOT_KEY
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}" "" "${PRODUCT_NAME}"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities" "ApplicationName" "${PRODUCT_NAME}"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities" "ApplicationDescription" "${PRODUCT_NAME} Browser"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities" "ApplicationIcon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\StartMenu" "StartMenuInternet" "${APP_EXECUTABLE_FILENAME}"

  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\FileAssociations" ".htm" "${APP_FILENAME}HTML"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\FileAssociations" ".html" "${APP_FILENAME}HTML"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\FileAssociations" ".shtml" "${APP_FILENAME}HTML"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\FileAssociations" ".xht" "${APP_FILENAME}HTML"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\FileAssociations" ".xhtml" "${APP_FILENAME}HTML"

  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\URLAssociations" "http" "${APP_FILENAME}URL"
  WriteRegStr ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities\URLAssociations" "https" "${APP_FILENAME}URL"

  WriteRegStr ${ROOT_KEY} "Software\RegisteredApplications" "${PRODUCT_NAME}" "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}\Capabilities"

  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}HTML" "" "${PRODUCT_NAME} HTML Document"
  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}HTML" "FriendlyTypeName" "${PRODUCT_NAME} HTML Document"
  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}HTML\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}HTML\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}URL" "" "${PRODUCT_NAME} URL"
  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}URL" "FriendlyTypeName" "${PRODUCT_NAME} URL"
  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}URL" "URL Protocol" ""
  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}URL\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr ${ROOT_KEY} "Software\Classes\${APP_FILENAME}URL\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro _UnregisterSessionBoxBrowser ROOT_KEY
  DeleteRegValue ${ROOT_KEY} "Software\RegisteredApplications" "${PRODUCT_NAME}"
  DeleteRegKey ${ROOT_KEY} "Software\Clients\StartMenuInternet\${APP_EXECUTABLE_FILENAME}"
  DeleteRegKey ${ROOT_KEY} "Software\Classes\${APP_FILENAME}HTML"
  DeleteRegKey ${ROOT_KEY} "Software\Classes\${APP_FILENAME}URL"
!macroend

!macro customInstall
  !insertmacro _RegisterSessionBoxBrowser SHELL_CONTEXT
!macroend

!macro customUnInstall
  !insertmacro _UnregisterSessionBoxBrowser SHELL_CONTEXT
!macroend
