interface ApplicationMenuHost {
  setApplicationMenu: (menu: null) => void
}

/** 应用自行处理快捷键，移除默认菜单中的 Ctrl/Cmd+W 关闭窗口入口。 */
export function configureApplicationMenu(menu: ApplicationMenuHost): void {
  menu.setApplicationMenu(null)
}
