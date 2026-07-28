# 你棋没我硬 - 项目架构

> 当前主工程：`D:\项目代码\JX双人五子棋`
>
> 发布形态：微信小游戏（Canvas），不是普通微信小程序。

## 运行主干

```text
game.js                         小游戏入口
game.json                       小游戏运行配置
game/
  runtime.js                    Canvas、云环境和场景注册
  design/
    theme.js                    全局颜色、圆角和布局规范
  core/                         输入、云调用、场景管理
  renderers/                    棋盘、按钮、卡片、文字绘制
  scenes/                       首页、本机、创建、加入、等待、联机对战
services/
  roomService.js                客户端房间云接口
utils/
  board.js                      棋盘与胜负基础规则
  onlineGameState.js            联机状态映射
  clipboard.js                  房间号复制、自动识别与 Toast 反馈
  share.js                      好友邀请参数、分享入口房间号解析
cloudfunctions/
  login/                        获取玩家 OpenID
  roomAction/                   创建、加入、落子、重开、退出的服务端裁判
```

数据流：

```text
Canvas 场景
  → roomService
  → login / roomAction 云函数
  → rooms 云数据库
  → 数据库 watch
  → 双方场景同步刷新
```

好友邀请入口：

```text
创建页 / 等待页
  → wx.shareAppMessage(query=roomId)
  → 好友点击微信分享卡片
  → runtime 读取冷启动或热启动 query
  → 加入页自动带入房间号
  → 玩家确认后调用 joinRoom
```

## UI 设计规范

- 视觉定位：暖玉、墨绿、棋盘金，简洁现代并保留棋类氛围。
- 主色：墨玉绿；辅助色：湖蓝；强调色：棋盘金；背景：暖米白。
- 页面组件统一复用 `theme.js`、`cardRenderer.js`、`buttonRenderer.js`。
- 交互层级：每页只有一个最主要操作；复制、返回、离开均使用次级样式。
- 文案定位：中文、短句、对局感明确，不使用密码式房间号占位。

## 工程与发布配置

- `project.config.json`：正式 AppID、小游戏编译类型、发布排除规则、云函数根目录。
- `scripts/verify-release.js`：统一自动发布门禁。
- `docs/PROJECT_PROGRESS.md`：唯一项目进度来源。
- `docs/RELEASE_CHECKLIST_V1.0.md`：上架前逐项确认清单。

## 保留的旧小程序代码

以下内容属于迁移前的普通小程序稳定版，用于历史参考，不进入小游戏发布包：

```text
app.js / app.json / app.wxss
pages/
components/
sitemap.json
```

不要在这些旧目录继续开发小游戏功能。新功能应进入 `game/`、`services/`、`utils/` 或 `cloudfunctions/`。

## 当前外部资源

- 正式小游戏 AppID：`wx08c6484b52864efa`
- 正式云环境：`cloud1-d3glf789q33b91507`
- 数据库集合：`rooms`
- 云函数：`login`、`roomAction`
