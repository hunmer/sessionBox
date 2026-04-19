# ESLint 代码检查报告

> 生成时间: 2026/4/19 11:33:56

## 概览

| 指标 | 数量 |
|------|------|
| 总问题数 | 2140 |
| 错误 (errors) | 509 |
| 警告 (warnings) | 1631 |
| 涉及文件数 | 210 |
| 可自动修复 | 约 1182 条 (vue/max-attributes-per-line 等) |

## 按规则统计

| 规则 | 错误 | 警告 | 合计 |
|------|------|------|------|
| `vue/max-attributes-per-line` | 0 | 1185 | 1185 |
| `no-undef` | 368 | 0 | 368 |
| `vue/singleline-html-element-content-newline` | 0 | 310 | 310 |
| `max-lines-per-function` | 73 | 0 | 73 |
| `vue/html-self-closing` | 0 | 43 | 43 |
| `no-empty` | 29 | 0 | 29 |
| `vue/attributes-order` | 0 | 28 | 28 |
| `vue/require-default-prop` | 0 | 27 | 27 |
| `vue/multi-word-component-names` | 25 | 0 | 25 |
| `vue/html-indent` | 0 | 24 | 24 |
| `vue/html-closing-bracket-spacing` | 0 | 7 | 7 |
| `prefer-const` | 5 | 0 | 5 |
| `vue/multiline-html-element-content-newline` | 0 | 4 | 4 |
| `no-useless-escape` | 3 | 0 | 3 |
| `max-lines` | 2 | 0 | 2 |
| `no-useless-assignment` | 2 | 0 | 2 |
| `vue/no-template-shadow` | 0 | 2 | 2 |
| `vue/no-unused-vars` | 1 | 0 | 1 |
| `vue/no-use-v-if-with-v-for` | 1 | 0 | 1 |
| `vue/no-v-html` | 0 | 1 | 1 |

## 问题最多的文件 Top 20

| 文件 | 错误 | 警告 | 合计 |
|------|------|------|------|
| `src/App.vue` | 47 | 80 | 127 |
| `src/components/chat/ChatMessage.vue` | 6 | 82 | 88 |
| `src/components/chat/ProviderManager.vue` | 0 | 69 | 69 |
| `src/components/bookmarks/BookmarkCheckDialog.vue` | 1 | 67 | 68 |
| `src/components/passwords/PasswordsPage.vue` | 5 | 57 | 62 |
| `src/components/workflow/WorkflowEditor.vue` | 37 | 25 | 62 |
| `src/components/download/DownloadsPage.vue` | 9 | 52 | 61 |
| `src/components/chat/ToolCallCard.vue` | 2 | 50 | 52 |
| `src/components/proxy/ProxyDialog.vue` | 1 | 51 | 52 |
| `src/components/tabs/TabItem.vue` | 23 | 28 | 51 |
| `src/components/sidebar/PageDialog.vue` | 1 | 46 | 47 |
| `src/components/toolbar/PasswordPopover.vue` | 7 | 36 | 43 |
| `src/components/chat/ChatInput.vue` | 10 | 31 | 41 |
| `src/components/common/RightPanel.vue` | 0 | 39 | 39 |
| `src/components/plugins/PluginsPage.vue` | 5 | 34 | 39 |
| `src/components/settings/SettingsAbout.vue` | 23 | 16 | 39 |
| `src/components/command-palette/CommandPaletteDialog.vue` | 19 | 17 | 36 |
| `src/components/common/UpdateNotification.vue` | 23 | 13 | 36 |
| `src/components/settings/SettingsContainer.vue` | 0 | 36 | 36 |
| `src/components/toolbar/BrowserToolbar.vue` | 9 | 27 | 36 |

## 错误详情 (仅 errors)

### `src/App.vue` (47 errors)

- **L66:27** `no-undef` — 'localStorage' is not defined.
- **L100:3** `no-undef` — 'window' is not defined.
- **L122:3** `no-undef` — 'console' is not defined.
- **L135:5** `no-undef` — 'console' is not defined.
- **L148:38** `no-undef` — 'setInterval' is not defined.
- **L152:24** `no-undef` — 'clearInterval' is not defined.
- **L156:21** `no-undef` — 'setInterval' is not defined.
- **L162:9** `no-undef` — 'clearInterval' is not defined.
- **L168:5** `no-undef` — 'setTimeout' is not defined.
- **L196:20** `no-undef` — 'localStorage' is not defined.
- **L202:31** `no-undef` — 'localStorage' is not defined.
- **L209:29** `no-undef` — 'localStorage' is not defined.
- **L219:76** `no-undef` — 'setTimeout' is not defined.
- **L245:34** `no-undef` — 'setTimeout' is not defined.
- **L249:5** `no-undef` — 'clearTimeout' is not defined.
- **L275:31** `no-undef` — 'setTimeout' is not defined.
- **L314:18** `no-undef` — 'clearTimeout' is not defined.
- **L315:15** `no-undef` — 'setTimeout' is not defined.
- **L317:5** `no-undef` — 'localStorage' is not defined.
- **L320:7** `no-undef` — 'localStorage' is not defined.
- **L326:9** `no-undef` — 'localStorage' is not defined.
- **L353:1** `no-undef` — 'window' is not defined.
- **L362:21** `no-undef` — 'document' is not defined.
- **L365:3** `no-undef` — 'window' is not defined.
- **L373:21** `no-undef` — 'ResizeObserver' is not defined.
- **L380:21** `no-undef` — 'document' is not defined.
- **L383:24** `no-undef` — 'ResizeObserver' is not defined.
- **L389:3** `no-undef` — 'window' is not defined.
- **L425:5** `no-undef` — 'setTimeout' is not defined.
- **L444:24** `no-undef` — 'clearInterval' is not defined.
- **L449:3** `no-undef` — 'window' is not defined.
- **L473:3** `no-undef` — 'localStorage' is not defined.
- **L494:25** `max-lines-per-function` — Arrow function has too many lines (133). Maximum allowed is 50.
- **L496:3** `no-undef` — 'console' is not defined.
- **L535:7** `no-undef` — 'window' is not defined.
- **L535:32** `no-undef` — 'CustomEvent' is not defined.
- **L547:21** `no-undef` — 'document' is not defined.
- **L547:44** `no-undef` — 'HTMLInputElement' is not defined.
- **L552:7** `no-undef` — 'window' is not defined.
- **L606:12** `no-undef` — 'window' is not defined.
- **L606:37** `no-undef` — 'CustomEvent' is not defined.
- **L610:12** `no-undef` — 'window' is not defined.
- **L610:37** `no-undef` — 'CustomEvent' is not defined.
- **L614:12** `no-undef` — 'window' is not defined.
- **L614:37** `no-undef` — 'CustomEvent' is not defined.
- **L622:21** `no-undef` — 'document' is not defined.
- **L622:44** `no-undef` — 'HTMLInputElement' is not defined.

### `src/components/chat/ChatMessage.vue` (6 errors)

- **L81:9** `no-undef` — 'navigator' is not defined.
- **L83:3** `no-undef` — 'setTimeout' is not defined.
- **L124:30** `no-undef` — 'setInterval' is not defined.
- **L129:11** `no-undef` — 'setInterval' is not defined.
- **L136:5** `no-undef` — 'clearInterval' is not defined.
- **L364:17** `vue/no-use-v-if-with-v-for` — This 'v-if' should be moved to the wrapper element.

### `src/components/bookmarks/BookmarkCheckDialog.vue` (1 errors)

- **L23:13** `no-undef` — 'window' is not defined.

### `src/components/passwords/PasswordsPage.vue` (5 errors)

- **L82:16** `no-undef` — 'URL' is not defined.
- **L116:11** `no-undef` — 'crypto' is not defined.
- **L117:11** `no-undef` — 'crypto' is not defined.
- **L133:9** `no-undef` — 'crypto' is not defined.
- **L201:9** `no-undef` — 'navigator' is not defined.

### `src/components/workflow/WorkflowEditor.vue` (37 errors)

- **L53:30** `no-undef` — 'MouseEvent' is not defined.
- **L53:43** `no-undef` — 'TouchEvent' is not defined.
- **L149:39** `no-undef` — 'localStorage' is not defined.
- **L155:5** `no-undef` — 'localStorage' is not defined.
- **L175:17** `no-undef` — 'localStorage' is not defined.
- **L186:3** `no-undef` — 'localStorage' is not defined.
- **L245:17** `no-undef` — 'localStorage' is not defined.
- **L254:42** `no-undef` — 'setTimeout' is not defined.
- **L257:26** `no-undef` — 'clearTimeout' is not defined.
- **L258:23** `no-undef` — 'setTimeout' is not defined.
- **L259:5** `no-undef` — 'localStorage' is not defined.
- **L315:28** `no-undef` — 'DragEvent' is not defined.
- **L322:24** `no-undef` — 'DragEvent' is not defined.
- **L349:23** `no-undef` — 'HTMLInputElement' is not defined.
- **L386:25** `no-undef` — 'window' is not defined.
- **L393:25** `no-undef` — 'window' is not defined.
- **L574:27** `no-undef` — 'KeyboardEvent' is not defined.
- **L597:22** `no-undef` — 'HTMLElement' is not defined.
- **L597:72** `no-undef` — 'HTMLElement' is not defined.
- **L604:22** `no-undef` — 'HTMLElement' is not defined.
- **L604:72** `no-undef` — 'HTMLElement' is not defined.
- **L611:22** `no-undef` — 'HTMLElement' is not defined.
- **L611:72** `no-undef` — 'HTMLElement' is not defined.
- **L618:22** `no-undef` — 'HTMLElement' is not defined.
- **L618:72** `no-undef` — 'HTMLElement' is not defined.
- **L625:30** `no-undef` — 'Event' is not defined.
- **L627:10** `no-undef` — 'CustomEvent' is not defined.
- **L630:31** `no-undef` — 'Event' is not defined.
- **L632:10** `no-undef` — 'CustomEvent' is not defined.
- **L635:33** `no-undef` — 'Event' is not defined.
- **L637:10** `no-undef` — 'CustomEvent' is not defined.
- **L641:3** `no-undef` — 'window' is not defined.
- **L642:3** `no-undef` — 'window' is not defined.
- **L643:3** `no-undef` — 'window' is not defined.
- **L648:3** `no-undef` — 'window' is not defined.
- **L649:3** `no-undef` — 'window' is not defined.
- **L650:3** `no-undef` — 'window' is not defined.

### `src/components/download/DownloadsPage.vue` (9 errors)

- **L37:34** `no-undef` — 'setInterval' is not defined.
- **L46:15** `no-undef` — 'setInterval' is not defined.
- **L54:18** `no-undef` — 'clearInterval' is not defined.
- **L84:16** `no-undef` — 'URL' is not defined.
- **L154:10** `no-undef` — 'window' is not defined.
- **L161:9** `no-undef` — 'window' is not defined.
- **L167:9** `no-undef` — 'window' is not defined.
- **L183:29** `no-undef` — 'DragEvent' is not defined.
- **L186:5** `no-undef` — 'window' is not defined.

### `src/components/chat/ToolCallCard.vue` (2 errors)

- **L22:3** `no-undef` — 'navigator' is not defined.
- **L24:5** `no-undef` — 'setTimeout' is not defined.

### `src/components/proxy/ProxyDialog.vue` (1 errors)

- **L195:28** `no-undef` — 'window' is not defined.

### `src/components/tabs/TabItem.vue` (23 errors)

- **L88:25** `no-undef` — 'MouseEvent' is not defined.
- **L96:16** `no-undef` — 'URL' is not defined.
- **L131:13** `no-undef` — 'window' is not defined.
- **L135:35** `no-undef` — 'setTimeout' is not defined.
- **L136:35** `no-undef` — 'setTimeout' is not defined.
- **L137:42** `no-undef` — 'setTimeout' is not defined.
- **L148:21** `no-undef` — 'clearTimeout' is not defined.
- **L149:21** `no-undef` — 'clearTimeout' is not defined.
- **L150:28** `no-undef` — 'clearTimeout' is not defined.
- **L154:21** `no-undef` — 'clearTimeout' is not defined.
- **L156:16** `no-undef` — 'setTimeout' is not defined.
- **L163:21** `no-undef` — 'clearTimeout' is not defined.
- **L164:16** `no-undef` — 'setTimeout' is not defined.
- **L168:21** `no-undef` — 'clearTimeout' is not defined.
- **L172:16** `no-undef` — 'setTimeout' is not defined.
- **L195:36** `no-undef` — 'DragEvent' is not defined.
- **L206:23** `no-undef` — 'setTimeout' is not defined.
- **L212:37** `no-undef` — 'DragEvent' is not defined.
- **L213:48** `no-undef` — 'HTMLElement' is not defined.
- **L214:48** `no-undef` — 'Node' is not defined.
- **L219:5** `no-undef` — 'clearTimeout' is not defined.
- **L224:42** `no-undef` — 'DragEvent' is not defined.
- **L228:5** `no-undef` — 'clearTimeout' is not defined.

### `src/components/sidebar/PageDialog.vue` (1 errors)

- **L67:27** `no-undef` — 'HTMLElement' is not defined.

### `src/components/toolbar/PasswordPopover.vue` (7 errors)

- **L29:16** `no-undef` — 'URL' is not defined.
- **L38:20** `no-undef` — 'URL' is not defined.
- **L58:9** `no-undef` — 'navigator' is not defined.
- **L78:11** `no-undef` — 'crypto' is not defined.
- **L79:11** `no-undef` — 'crypto' is not defined.
- **L91:9** `no-undef` — 'crypto' is not defined.
- **L110:19** `no-undef` — 'URL' is not defined.

### `src/components/chat/ChatInput.vue` (10 errors)

- **L94:27** `no-undef` — 'KeyboardEvent' is not defined.
- **L110:17** `no-undef` — 'document' is not defined.
- **L124:29** `no-undef` — 'File' is not defined.
- **L126:24** `no-undef` — 'FileReader' is not defined.
- **L146:26** `no-undef` — 'window' is not defined.
- **L156:11** `no-undef` — 'navigator' is not defined.
- **L158:5** `no-undef` — 'setTimeout' is not defined.
- **L175:43** `no-undef` — 'window' is not defined.
- **L190:11** `no-undef` — 'window' is not defined.
- **L219:11** `no-undef` — 'window' is not defined.

### `src/components/plugins/PluginsPage.vue` (5 errors)

- **L102:24** `no-undef` — 'fetch' is not defined.
- **L148:5** `no-undef` — 'console' is not defined.
- **L161:5** `no-undef` — 'console' is not defined.
- **L172:26** `no-undef` — 'window' is not defined.
- **L189:26** `no-undef` — 'window' is not defined.

### `src/components/settings/SettingsAbout.vue` (23 errors)

- **L62:3** `no-undef` — 'window' is not defined.
- **L67:8** `no-undef` — 'window' is not defined.
- **L68:25** `no-undef` — 'window' is not defined.
- **L69:32** `no-undef` — 'window' is not defined.
- **L74:8** `no-undef` — 'window' is not defined.
- **L76:26** `no-undef` — 'window' is not defined.
- **L81:5** `no-undef` — 'console' is not defined.
- **L87:8** `no-undef` — 'window' is not defined.
- **L93:26** `no-undef` — 'window' is not defined.
- **L122:8** `no-undef` — 'window' is not defined.
- **L123:24** `no-undef` — 'window' is not defined.
- **L131:8** `no-undef` — 'window' is not defined.
- **L141:24** `no-undef` — 'window' is not defined.
- **L154:8** `no-undef` — 'window' is not defined.
- **L155:9** `no-undef` — 'window' is not defined.
- **L160:36** `no-undef` — 'setTimeout' is not defined.
- **L163:20** `no-undef` — 'clearTimeout' is not defined.
- **L164:17** `no-undef` — 'setTimeout' is not defined.
- **L174:8** `no-undef` — 'window' is not defined.
- **L177:26** `no-undef` — 'window' is not defined.
- **L184:29** `no-undef` — 'window' is not defined.
- **L192:22** `no-undef` — 'window' is not defined.
- **L202:20** `no-undef` — 'clearTimeout' is not defined.

### `src/components/command-palette/CommandPaletteDialog.vue` (19 errors)

- **L27:22** `no-undef` — 'HTMLInputElement' is not defined.
- **L55:35** `no-undef` — 'setTimeout' is not defined.
- **L58:19** `no-undef` — 'clearTimeout' is not defined.
- **L61:18** `no-undef` — 'setTimeout' is not defined.
- **L70:38** `no-undef` — 'setTimeout' is not defined.
- **L76:22** `no-undef` — 'clearTimeout' is not defined.
- **L80:21** `no-undef` — 'setTimeout' is not defined.
- **L103:5** `no-undef` — 'clearTimeout' is not defined.
- **L109:33** `no-undef` — 'Event' is not defined.
- **L148:29** `no-undef` — 'HTMLElement' is not defined.
- **L149:40** `no-undef` — 'HTMLElement' is not defined.
- **L151:82** `no-undef` — 'HTMLElement' is not defined.
- **L155:27** `no-undef` — 'KeyboardEvent' is not defined.
- **L162:30** `no-undef` — 'document' is not defined.
- **L162:56** `no-undef` — 'HTMLElement' is not defined.
- **L177:7** `no-undef` — 'document' is not defined.
- **L184:56** `no-undef` — 'document' is not defined.
- **L235:22** `no-undef` — 'clearTimeout' is not defined.
- **L236:19** `no-undef` — 'clearTimeout' is not defined.

### `src/components/common/UpdateNotification.vue` (23 errors)

- **L92:8** `no-undef` — 'window' is not defined.
- **L98:26** `no-undef` — 'window' is not defined.
- **L104:5** `no-undef` — 'console' is not defined.
- **L113:8** `no-undef` — 'window' is not defined.
- **L120:26** `no-undef` — 'window' is not defined.
- **L125:5** `no-undef` — 'console' is not defined.
- **L134:8** `no-undef` — 'window' is not defined.
- **L137:11** `no-undef` — 'window' is not defined.
- **L140:5** `no-undef` — 'console' is not defined.
- **L152:8** `no-undef` — 'window' is not defined.
- **L153:5** `no-undef` — 'console' is not defined.
- **L159:33** `no-undef` — 'window' is not defined.
- **L164:5** `no-undef` — 'console' is not defined.
- **L168:26** `no-undef` — 'window' is not defined.
- **L169:5** `no-undef` — 'console' is not defined.
- **L177:29** `no-undef` — 'window' is not defined.
- **L178:5** `no-undef` — 'console' is not defined.
- **L184:25** `no-undef` — 'window' is not defined.
- **L185:5** `no-undef` — 'console' is not defined.
- **L191:27** `no-undef` — 'window' is not defined.
- **L192:5** `no-undef` — 'console' is not defined.
- **L200:22** `no-undef` — 'window' is not defined.
- **L201:5** `no-undef` — 'console' is not defined.

### `src/components/toolbar/BrowserToolbar.vue` (9 errors)

- **L21:13** `no-undef` — 'window' is not defined.
- **L27:24** `no-undef` — 'HTMLElement' is not defined.
- **L45:12** `no-useless-escape` — Unnecessary escape character: \..
- **L45:15** `no-useless-escape` — Unnecessary escape character: \/.
- **L137:17** `no-undef` — 'document' is not defined.
- **L137:40** `no-undef` — 'HTMLInputElement' is not defined.
- **L142:3** `no-undef` — 'setTimeout' is not defined.
- **L150:32** `no-undef` — 'KeyboardEvent' is not defined.
- **L191:16** `no-undef` — 'document' is not defined.

### `src/components/common/SnifferMiniPopover.vue` (11 errors)

- **L42:16** `no-undef` — 'URL' is not defined.
- **L95:34** `no-undef` — 'MouseEvent' is not defined.
- **L96:35** `no-undef` — 'HTMLElement' is not defined.
- **L102:34** `no-undef` — 'MouseEvent' is not defined.
- **L103:35** `no-undef` — 'HTMLElement' is not defined.
- **L133:11** `no-undef` — 'navigator' is not defined.
- **L142:11** `no-undef` — 'window' is not defined.
- **L165:19** `no-undef` — 'HTMLAudioElement' is not defined.
- **L177:22** `no-undef` — 'Audio' is not defined.
- **L213:29** `no-undef` — 'MouseEvent' is not defined.
- **L215:34** `no-undef` — 'HTMLElement' is not defined.

### `src/components/settings/ExtensionManager.vue` (4 errors)

- **L39:5** `no-undef` — 'console' is not defined.
- **L41:5** `no-undef` — 'console' is not defined.
- **L50:5** `no-undef` — 'console' is not defined.
- **L68:8** `no-undef` — 'confirm' is not defined.

### `src/components/sidebar/GroupDialog.vue` (1 errors)

- **L62:24** `no-undef` — 'window' is not defined.

### `src/components/plugins/PluginCard.vue` (1 errors)

- **L36:33** `no-undef` — 'window' is not defined.

### `src/components/sidebar/GroupItem.vue` (10 errors)

- **L110:17** `no-undef` — 'localStorage' is not defined.
- **L125:3** `no-undef` — 'localStorage' is not defined.
- **L133:43** `no-undef` — 'setTimeout' is not defined.
- **L137:3** `no-undef` — 'clearTimeout' is not defined.
- **L155:36** `no-undef` — 'DragEvent' is not defined.
- **L169:24** `no-undef` — 'setTimeout' is not defined.
- **L175:37** `no-undef` — 'DragEvent' is not defined.
- **L176:48** `no-undef` — 'HTMLElement' is not defined.
- **L177:48** `no-undef` — 'Node' is not defined.
- **L186:38** `no-undef` — 'DragEvent' is not defined.

### `src/components/settings/SettingsGeneral.vue` (11 errors)

- **L12:19** `no-undef` — 'navigator' is not defined.
- **L13:48** `no-undef` — 'setInterval' is not defined.
- **L14:52** `no-undef` — 'setTimeout' is not defined.
- **L18:5** `no-undef` — 'clearInterval' is not defined.
- **L22:5** `no-undef` — 'clearTimeout' is not defined.
- **L30:29** `no-undef` — 'setInterval' is not defined.
- **L37:33** `no-undef` — 'setTimeout' is not defined.
- **L43:34** `no-undef` — 'window' is not defined.
- **L48:24** `no-undef` — 'window' is not defined.
- **L71:9** `no-undef` — 'window' is not defined.
- **L77:33** `no-undef` — 'window' is not defined.

### `electron/services/store.ts` (19 errors)

- **L336:69** `no-empty` — Empty block statement.
- **L346:75** `no-empty` — Empty block statement.
- **L358:62** `no-empty` — Empty block statement.
- **L368:74** `no-empty` — Empty block statement.
- **L390:61** `no-empty` — Empty block statement.
- **L400:71** `no-empty` — Empty block statement.
- **L407:61** `no-empty` — Empty block statement.
- **L417:66** `no-empty` — Empty block statement.
- **L431:69** `no-empty` — Empty block statement.
- **L441:75** `no-empty` — Empty block statement.
- **L447:62** `no-empty` — Empty block statement.
- **L457:74** `no-empty` — Empty block statement.
- **L471:59** `no-empty` — Empty block statement.
- **L481:72** `no-empty` — Empty block statement.
- **L488:57** `no-empty` — Empty block statement.
- **L498:64** `no-empty` — Empty block statement.
- **L585:61** `no-empty` — Empty block statement.
- **L595:71** `no-empty` — Empty block statement.
- **L612:58** `no-empty` — Empty block statement.

### `src/components/bookmarks/BookmarkBar.vue` (5 errors)

- **L30:28** `no-undef` — 'HTMLElement' is not defined.
- **L32:21** `no-undef` — 'ResizeObserver' is not defined.
- **L44:44** `no-undef` — 'HTMLElement' is not defined.
- **L90:7** `no-undef` — 'confirm' is not defined.
- **L117:26** `no-undef` — 'ResizeObserver' is not defined.

### `src/components/settings/SettingsShortcut.vue` (6 errors)

- **L46:34** `no-undef` — 'KeyboardEvent' is not defined.
- **L52:7** `no-useless-assignment` — The value assigned to 'key' is not used in subsequent statements.
- **L92:24** `no-undef` — 'KeyboardEvent' is not defined.
- **L96:29** `no-undef` — 'KeyboardEvent' is not defined.
- **L184:3** `no-undef` — 'window' is not defined.
- **L188:3** `no-undef` — 'window' is not defined.

### `src/components/tabs/SplitView.vue` (15 errors)

- **L57:16** `no-undef` — 'document' is not defined.
- **L71:3** `no-undef` — 'window' is not defined.
- **L122:33** `no-undef` — 'DragEvent' is not defined.
- **L122:52** `no-undef` — 'HTMLElement' is not defined.
- **L141:39** `no-undef` — 'DOMRect' is not defined.
- **L142:10** `no-undef` — 'document' is not defined.
- **L147:3** `no-undef` — 'window' is not defined.
- **L157:33** `no-undef` — 'DragEvent' is not defined.
- **L171:31** `no-undef` — 'DragEvent' is not defined.
- **L173:41** `no-undef` — 'HTMLElement' is not defined.
- **L185:37** `no-undef` — 'DragEvent' is not defined.
- **L189:36** `no-undef` — 'DragEvent' is not defined.
- **L196:32** `no-undef` — 'DragEvent' is not defined.
- **L198:41** `no-undef` — 'HTMLElement' is not defined.
- **L287:3** `no-undef` — 'window' is not defined.

### `src/components/bookmarks/FolderTreeItem.vue` (10 errors)

- **L71:29** `no-undef` — 'DragEvent' is not defined.
- **L76:37** `no-undef` — 'HTMLElement' is not defined.
- **L80:5** `no-undef` — 'document' is not defined.
- **L82:3** `no-undef` — 'document' is not defined.
- **L85:28** `no-undef` — 'DragEvent' is not defined.
- **L95:66** `no-undef` — 'HTMLElement' is not defined.
- **L100:29** `no-undef` — 'DragEvent' is not defined.
- **L101:42** `no-undef` — 'HTMLElement' is not defined.
- **L102:42** `no-undef` — 'HTMLElement' is not defined.
- **L108:24** `no-undef` — 'DragEvent' is not defined.

### `src/components/bookmarks/BookmarkList.vue` (8 errors)

- **L49:37** `no-undef` — 'DragEvent' is not defined.
- **L49:57** `no-undef` — 'HTMLElement' is not defined.
- **L55:32** `no-undef` — 'DragEvent' is not defined.
- **L62:78** `no-undef` — 'HTMLElement' is not defined.
- **L65:33** `no-undef` — 'DragEvent' is not defined.
- **L66:42** `no-undef` — 'HTMLElement' is not defined.
- **L67:42** `no-undef` — 'HTMLElement' is not defined.
- **L73:28** `no-undef` — 'DragEvent' is not defined.

### `src/components/tabs/TabBar.vue` (1 errors)

- **L58:25** `no-undef` — 'window' is not defined.

### `src/components/bookmarks/BookmarkItem.vue` (4 errors)

- **L30:29** `no-undef` — 'DragEvent' is not defined.
- **L35:38** `no-undef` — 'HTMLElement' is not defined.
- **L39:5** `no-undef` — 'document' is not defined.
- **L41:3** `no-undef` — 'document' is not defined.

### `src/components/settings/SettingsSearch.vue` (1 errors)

- **L8:13** `no-undef` — 'window' is not defined.

### `src/components/settings/SettingsTheme.vue` (3 errors)

- **L93:11** `no-undef` — 'navigator' is not defined.
- **L103:26** `no-undef` — 'window' is not defined.
- **L127:11** `no-undef` — 'window' is not defined.

### `src/components/tabs/TabOverviewDialog.vue` (3 errors)

- **L25:13** `no-undef` — 'window' is not defined.
- **L31:21** `no-undef` — 'HTMLElement' is not defined.
- **L144:27** `no-undef` — 'KeyboardEvent' is not defined.

### `src/components/tabs/SplitLayoutTree.vue` (4 errors)

- **L32:25** `no-undef` — 'DragEvent' is not defined.
- **L34:30** `no-undef` — 'DragEvent' is not defined.
- **L35:29** `no-undef` — 'DragEvent' is not defined.
- **L36:24** `no-undef` — 'DragEvent' is not defined.

### `src/components/chat/ChatMessageList.vue` (1 errors)

- **L23:26** `no-undef` — 'HTMLDivElement' is not defined.

### `src/components/settings/SettingsSites.vue` (1 errors)

- **L7:13** `no-undef` — 'window' is not defined.

### `src/components/tabs/NewTabDialog.vue` (3 errors)

- **L35:17** `no-undef` — 'localStorage' is not defined.
- **L47:3** `no-undef` — 'localStorage' is not defined.
- **L78:27** `no-undef` — 'URL' is not defined.

### `src/components/WorkspaceSwitcher.vue` (1 errors)

- **L111:32** `vue/no-unused-vars` — 'index' is defined but never used.

### `src/components/download/AddDownloadDialog.vue` (3 errors)

- **L26:26** `no-undef` — 'URL' is not defined.
- **L65:11** `no-undef` — 'window' is not defined.
- **L81:26** `no-undef` — 'window' is not defined.

### `src/components/sidebar/ContainerItem.vue` (2 errors)

- **L22:13** `no-undef` — 'window' is not defined.
- **L29:5** `no-undef` — 'console' is not defined.

### `electron/services/proxy.ts` (9 errors)

- **L289:1** `max-lines-per-function` — Function 'requestThroughTlsSocket' has too many lines (64). Maximum allowed is 50.
- **L290:22** `max-lines-per-function` — Arrow function has too many lines (62). Maximum allowed is 50.
- **L393:1** `max-lines-per-function` — Function 'testHttpConnectProxy' has too many lines (75). Maximum allowed is 50.
- **L394:22** `max-lines-per-function` — Async arrow function has too many lines (73). Maximum allowed is 50.
- **L414:76** `max-lines-per-function` — Arrow function has too many lines (56). Maximum allowed is 50.
- **L484:9** `prefer-const` — 'chunks' is never reassigned. Use 'const' instead.
- **L529:7** `no-useless-assignment` — The value assigned to 'restLength' is not used in subsequent statements.
- **L545:1** `max-lines-per-function` — Function 'testSocks5Proxy' has too many lines (59). Maximum allowed is 50.
- **L546:22** `max-lines-per-function` — Async arrow function has too many lines (57). Maximum allowed is 50.

### `src/components/common/PluginMiniPopover.vue` (1 errors)

- **L27:40** `no-undef` — 'window' is not defined.

### `src/components/settings/SettingsUser.vue` (3 errors)

- **L11:24** `no-undef` — 'window' is not defined.
- **L17:30** `no-undef` — 'Event' is not defined.
- **L18:28** `no-undef` — 'HTMLInputElement' is not defined.

### `src/components/workflow/CustomNodeWrapper.vue` (2 errors)

- **L25:22** `no-undef` — 'HTMLInputElement' is not defined.
- **L96:3** `no-undef` — 'setTimeout' is not defined.

### `electron/services/ai-proxy.ts` (7 errors)

- **L86:8** `max-lines-per-function` — Async function 'proxyChatCompletions' has too many lines (175). Maximum allowed is 50.
- **L117:9** `prefer-const` — 'currentMessages' is never reassigned. Use 'const' instead.
- **L118:9** `prefer-const` — 'cumulativeUsage' is never reassigned. Use 'const' instead.
- **L306:1** `max-lines-per-function` — Function 'forwardSSEEvent' has too many lines (53). Maximum allowed is 50.
- **L379:1** `max-lines-per-function` — Async function 'parseSSEStream' has too many lines (95). Maximum allowed is 50.
- **L507:8** `max-lines-per-function` — Async function 'executeTool' has too many lines (552). Maximum allowed is 50.
- **L1195:1** `max-lines` — File has too many lines (1003). Maximum allowed is 1000.

### `electron/services/bookmark-store.ts` (7 errors)

- **L37:63** `no-empty` — Empty block statement.
- **L47:74** `no-empty` — Empty block statement.
- **L53:61** `no-empty` — Empty block statement.
- **L60:68** `no-empty` — Empty block statement.
- **L96:72** `no-empty` — Empty block statement.
- **L106:81** `no-empty` — Empty block statement.
- **L116:68** `no-empty` — Empty block statement.

### `src/components/common/IconSelector.vue` (2 errors)

- **L42:24** `no-undef` — 'window' is not defined.
- **L56:24** `no-undef` — 'window' is not defined.

### `src/components/settings/SettingsMCP.vue` (1 errors)

- **L38:3** `no-undef` — 'navigator' is not defined.

### `src/components/toolbar/ExtensionActionList.vue` (3 errors)

- **L37:67** `no-undef` — 'MouseEvent' is not defined.
- **L38:41** `no-undef` — 'HTMLElement' is not defined.
- **L40:9** `no-undef` — 'window' is not defined.

### `src/components/bookmarks/FolderTree.vue` (5 errors)

- **L21:37** `no-undef` — 'DragEvent' is not defined.
- **L36:33** `no-undef` — 'DragEvent' is not defined.
- **L48:38** `no-undef` — 'DragEvent' is not defined.
- **L49:42** `no-undef` — 'HTMLElement' is not defined.
- **L50:42** `no-undef` — 'HTMLElement' is not defined.

### `src/components/sidebar/MemoryInfo.vue` (4 errors)

- **L13:13** `no-undef` — 'window' is not defined.
- **L40:30** `no-undef` — 'setInterval' is not defined.
- **L55:11** `no-undef` — 'setInterval' is not defined.
- **L60:5** `no-undef` — 'clearInterval' is not defined.

### `src/components/sidebar/Sidebar.vue` (3 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Sidebar" should always be multi-word.
- **L68:8** `no-undef` — 'confirm' is not defined.
- **L105:8** `no-undef` — 'confirm' is not defined.

### `electron/services/mcp/tools/cdp.ts` (4 errors)

- **L23:61** `no-empty` — Empty block statement.
- **L24:58** `no-empty` — Empty block statement.
- **L25:61** `no-empty` — Empty block statement.
- **L45:8** `max-lines-per-function` — Function 'registerCdpTools' has too many lines (66). Maximum allowed is 50.

### `src/components/download/DownloadFilterPanel.vue` (1 errors)

- **L89:28** `no-undef` — 'URL' is not defined.

### `src/components/plugins/PluginSettings.vue` (2 errors)

- **L14:26** `no-undef` — 'HTMLElement' is not defined.
- **L54:5** `no-undef` — 'console' is not defined.

### `src/components/ui/button/Button.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Button" should always be multi-word.

### `src/components/ui/command/CommandDialog.vue` (1 errors)

- **L16:28** `no-undef` — 'Event' is not defined.

### `src/components/ui/input-group/InputGroupAddon.vue` (3 errors)

- **L14:40** `no-undef` — 'MouseEvent' is not defined.
- **L15:44** `no-undef` — 'HTMLElement' is not defined.
- **L16:30** `no-undef` — 'HTMLElement' is not defined.

### `src/components/ui/sidebar/Sidebar.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Sidebar" should always be multi-word.

### `src/components/workflow/NodeSidebar.vue` (1 errors)

- **L30:29** `no-undef` — 'DragEvent' is not defined.

### `electron/services/workflow-tool-executor.ts` (3 errors)

- **L85:1** `max-lines-per-function` — Function 'executeGetWorkflow' has too many lines (55). Maximum allowed is 50.
- **L187:8** `max-lines-per-function` — Async function 'executeWorkflowTool' has too many lines (239). Maximum allowed is 50.
- **L456:1** `max-lines-per-function` — Function 'executeSingleOp' has too many lines (92). Maximum allowed is 50.

### `src/components/chat/BrowserViewPicker.vue` (1 errors)

- **L20:16** `no-undef` — 'URL' is not defined.

### `src/components/ui/sidebar/SidebarProvider.vue` (2 errors)

- **L34:3** `no-undef` — 'document' is not defined.
- **L46:37** `no-undef` — 'KeyboardEvent' is not defined.

### `src/lib/agent/tools.ts` (3 errors)

- **L478:8** `max-lines-per-function` — Function 'createBrowserTools' has too many lines (406). Maximum allowed is 50.
- **L887:8** `max-lines-per-function` — Function 'createToolDiscoveryTools' has too many lines (54). Maximum allowed is 50.
- **L1038:1** `max-lines` — File has too many lines (1061). Maximum allowed is 1000.

### `src/stores/chat.ts` (3 errors)

- **L21:8** `max-lines-per-function` — Function 'createChatStore' has too many lines (445). Maximum allowed is 50.
- **L23:31** `max-lines-per-function` — Arrow function has too many lines (442). Maximum allowed is 50.
- **L96:5** `max-lines-per-function` — Async function 'streamAssistantReply' has too many lines (167). Maximum allowed is 50.

### `src/stores/password.ts` (3 errors)

- **L66:1** `max-lines-per-function` — Function 'extractStandardFields' has too many lines (51). Maximum allowed is 50.
- **L131:57** `max-lines-per-function` — Arrow function has too many lines (150). Maximum allowed is 50.
- **L194:3** `max-lines-per-function` — Async function 'importPasswords' has too many lines (81). Maximum allowed is 50.

### `electron/main.ts` (2 errors)

- **L144:3** `max-lines-per-function` — Function 'createWindow' has too many lines (111). Maximum allowed is 50.
- **L288:24** `max-lines-per-function` — Arrow function has too many lines (69). Maximum allowed is 50.

### `electron/services/bookmark-checker.ts` (2 errors)

- **L46:1** `max-lines-per-function` — Async function 'checkUrl' has too many lines (63). Maximum allowed is 50.
- **L128:8** `max-lines-per-function` — Function 'startCheck' has too many lines (52). Maximum allowed is 50.

### `electron/services/mcp/server.ts` (2 errors)

- **L26:3** `max-lines-per-function` — Async method 'start' has too many lines (77). Maximum allowed is 50.
- **L39:35** `max-lines-per-function` — Async arrow function has too many lines (61). Maximum allowed is 50.

### `electron/services/mcp/tools/query.ts` (2 errors)

- **L12:8** `max-lines-per-function` — Function 'registerQueryTools' has too many lines (150). Maximum allowed is 50.
- **L128:5** `max-lines-per-function` — Async arrow function has too many lines (53). Maximum allowed is 50.

### `electron/services/mcp/tools/tab.ts` (2 errors)

- **L19:8** `max-lines-per-function` — Function 'registerTabTools' has too many lines (141). Maximum allowed is 50.
- **L31:13** `prefer-const` — 'finalPageId' is never reassigned. Use 'const' instead.

### `electron/services/page-extractor.ts` (2 errors)

- **L194:8** `max-lines-per-function` — Async function 'extractInteractiveNodes' has too many lines (96). Maximum allowed is 50.
- **L306:8** `max-lines-per-function` — Async function 'extractInteractiveNodeDetail' has too many lines (71). Maximum allowed is 50.

### `electron/services/plugin-manager.ts` (2 errors)

- **L238:3** `max-lines-per-function` — Async method 'importFromZip' has too many lines (51). Maximum allowed is 50.
- **L321:3** `max-lines-per-function` — Async method 'installFromUrl' has too many lines (56). Maximum allowed is 50.

### `electron/services/webview/events.ts` (2 errors)

- **L10:8** `max-lines-per-function` — Function 'setupEventForwarding' has too many lines (141). Maximum allowed is 50.
- **L179:1** `max-lines-per-function` — Function 'buildContextMenuItems' has too many lines (54). Maximum allowed is 50.

### `src/components/command-palette/providers/global.ts` (2 errors)

- **L5:8** `max-lines-per-function` — Function 'createGlobalCommandProvider' has too many lines (82). Maximum allowed is 50.
- **L17:5** `max-lines-per-function` — Async method 'search' has too many lines (68). Maximum allowed is 50.

### `src/components/ui/command/Command.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Command" should always be multi-word.

### `src/components/ui/progress/Progress.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Progress" should always be multi-word.

### `src/components/ui/separator/Separator.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Separator" should always be multi-word.

### `src/components/ui/switch/Switch.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Switch" should always be multi-word.

### `src/components/ui/toggle/Toggle.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Toggle" should always be multi-word.

### `src/composables/useCommandPalette.ts` (2 errors)

- **L15:8** `max-lines-per-function` — Function 'useCommandPalette' has too many lines (119). Maximum allowed is 50.
- **L86:3** `max-lines-per-function` — Async function 'search' has too many lines (54). Maximum allowed is 50.

### `src/stores/bookmark.ts` (2 errors)

- **L7:57** `max-lines-per-function` — Arrow function has too many lines (305). Maximum allowed is 50.
- **L193:3** `max-lines-per-function` — Function 'parseBookmarkHTML' has too many lines (56). Maximum allowed is 50.

### `src/stores/tab.ts` (2 errors)

- **L20:47** `max-lines-per-function` — Arrow function has too many lines (698). Maximum allowed is 50.
- **L601:3** `max-lines-per-function` — Function 'setupListeners' has too many lines (137). Maximum allowed is 50.

### `electron/composables/useAutoUpdater.ts` (1 errors)

- **L16:8** `max-lines-per-function` — Function 'useAutoUpdater' has too many lines (145). Maximum allowed is 50.

### `electron/ipc/chat.ts` (1 errors)

- **L5:8** `max-lines-per-function` — Function 'registerChatIpcHandlers' has too many lines (120). Maximum allowed is 50.

### `electron/ipc/download.ts` (1 errors)

- **L23:8** `max-lines-per-function` — Function 'registerDownloadIpcHandlers' has too many lines (62). Maximum allowed is 50.

### `electron/ipc/extensions.ts` (1 errors)

- **L60:8** `max-lines-per-function` — Function 'registerExtensionHandlers' has too many lines (109). Maximum allowed is 50.

### `electron/ipc/index.ts` (1 errors)

- **L103:8** `max-lines-per-function` — Function 'registerIpcHandlers' has too many lines (347). Maximum allowed is 50.

### `electron/ipc/tab.ts` (1 errors)

- **L20:8** `max-lines-per-function` — Function 'registerTabIpcHandlers' has too many lines (162). Maximum allowed is 50.

### `electron/ipc/updater.ts` (1 errors)

- **L17:8** `max-lines-per-function` — Function 'registerUpdaterIpc' has too many lines (57). Maximum allowed is 50.

### `electron/services/mcp/tools/window.ts` (1 errors)

- **L27:8** `max-lines-per-function` — Function 'registerWindowTools' has too many lines (157). Maximum allowed is 50.

### `electron/services/migration.ts` (1 errors)

- **L61:7** `prefer-const` — 'folders' is never reassigned. Use 'const' instead.

### `electron/services/plugin-context.ts` (1 errors)

- **L6:8** `max-lines-per-function` — Function 'createPluginContext' has too many lines (60). Maximum allowed is 50.

### `electron/services/tray.ts` (1 errors)

- **L68:3** `max-lines-per-function` — Method 'buildMenu' has too many lines (130). Maximum allowed is 50.

### `electron/services/webview-manager.ts` (1 errors)

- **L167:3** `max-lines-per-function` — Method 'createView' has too many lines (82). Maximum allowed is 50.

### `electron/services/webview/proxy.ts` (1 errors)

- **L118:8** `max-lines-per-function` — Async function 'detectProxyInfo' has too many lines (58). Maximum allowed is 50.

### `src/components/settings/SettingsTabs.vue` (1 errors)

- **L6:13** `no-undef` — 'window' is not defined.

### `src/components/ui/avatar/Avatar.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Avatar" should always be multi-word.

### `src/components/ui/badge/Badge.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Badge" should always be multi-word.

### `src/components/ui/breadcrumb/Breadcrumb.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Breadcrumb" should always be multi-word.

### `src/components/ui/checkbox/Checkbox.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Checkbox" should always be multi-word.

### `src/components/ui/collapsible/Collapsible.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Collapsible" should always be multi-word.

### `src/components/ui/command/CommandItem.vue` (1 errors)

- **L41:41** `no-undef` — 'HTMLElement' is not defined.

### `src/components/ui/dialog/Dialog.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Dialog" should always be multi-word.

### `src/components/ui/input/Input.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Input" should always be multi-word.

### `src/components/ui/kbd/Kbd.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Kbd" should always be multi-word.

### `src/components/ui/menubar/Menubar.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Menubar" should always be multi-word.

### `src/components/ui/popover/Popover.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Popover" should always be multi-word.

### `src/components/ui/select/Select.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Select" should always be multi-word.

### `src/components/ui/sheet/Sheet.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Sheet" should always be multi-word.

### `src/components/ui/skeleton/Skeleton.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Skeleton" should always be multi-word.

### `src/components/ui/sonner/Sonner.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Sonner" should always be multi-word.

### `src/components/ui/tabs/Tabs.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Tabs" should always be multi-word.

### `src/components/ui/textarea/Textarea.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Textarea" should always be multi-word.

### `src/components/ui/tooltip/Tooltip.vue` (1 errors)

- **L1:1** `vue/multi-word-component-names` — Component name "Tooltip" should always be multi-word.

### `src/components/workflow/CustomEdge.vue` (1 errors)

- **L32:29** `no-undef` — 'MouseEvent' is not defined.

### `src/composables/useNotification.ts` (1 errors)

- **L74:8** `max-lines-per-function` — Function 'useNotification' has too many lines (68). Maximum allowed is 50.

### `src/lib/agent/agent.ts` (1 errors)

- **L28:8** `max-lines-per-function` — Async function 'runAgentStream' has too many lines (68). Maximum allowed is 50.

### `src/lib/agent/stream.ts` (1 errors)

- **L41:8** `max-lines-per-function` — Function 'listenToChatStream' has too many lines (72). Maximum allowed is 50.

### `src/lib/external-drop.ts` (1 errors)

- **L31:12** `no-useless-escape` — Unnecessary escape character: \..

### `src/stores/ai-provider.ts` (1 errors)

- **L8:62** `max-lines-per-function` — Arrow function has too many lines (89). Maximum allowed is 50.

### `src/stores/container.ts` (1 errors)

- **L8:59** `max-lines-per-function` — Arrow function has too many lines (125). Maximum allowed is 50.

### `src/stores/download.ts` (1 errors)

- **L46:57** `max-lines-per-function` — Arrow function has too many lines (110). Maximum allowed is 50.

### `src/stores/extension.ts` (1 errors)

- **L5:59** `max-lines-per-function` — Arrow function has too many lines (80). Maximum allowed is 50.

### `src/stores/plugin.ts` (1 errors)

- **L5:53** `max-lines-per-function` — Arrow function has too many lines (73). Maximum allowed is 50.

### `src/stores/shortcut.ts` (1 errors)

- **L7:57** `max-lines-per-function` — Arrow function has too many lines (52). Maximum allowed is 50.

### `src/stores/sniffer.ts` (1 errors)

- **L7:55** `max-lines-per-function` — Arrow function has too many lines (89). Maximum allowed is 50.

### `src/stores/split.ts` (1 errors)

- **L109:51** `max-lines-per-function` — Arrow function has too many lines (345). Maximum allowed is 50.

### `src/stores/theme.ts` (1 errors)

- **L350:51** `max-lines-per-function` — Arrow function has too many lines (56). Maximum allowed is 50.

### `src/stores/workflow.ts` (1 errors)

- **L17:57** `max-lines-per-function` — Arrow function has too many lines (537). Maximum allowed is 50.

### `src/stores/workspace.ts` (1 errors)

- **L13:59** `max-lines-per-function` — Arrow function has too many lines (90). Maximum allowed is 50.


## 建议

1. **高优先级**: `no-undef` (368 errors) — 全局变量未声明，需要补充 `globals` 配置或添加类型声明
2. **中优先级**: `max-lines-per-function` (73 errors) — 大量函数超过 50 行，建议拆分
3. **低优先级**: `vue/max-attributes-per-line` (1185 warnings) — 纯格式问题，可 `eslint --fix` 自动修复
4. **低优先级**: `vue/singleline-html-element-content-newline` (310 warnings) — 格式问题，可自动修复
5. **中优先级**: `no-empty` (29 errors) — 空代码块，检查是否有遗漏的逻辑
6. **低优先级**: `vue/multi-word-component-names` (25 errors) — Vue 组件命名规范，可按需调整
