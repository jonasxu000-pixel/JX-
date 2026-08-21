# 棋遇五子棋 - 项目架构

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
  renderers/                    棋盘、按钮、卡片、头像、文字绘制
  scenes/                       首页、玩家资料、本机、人机、创建、加入、等待、联机对战
services/
  roomService.js                客户端房间云接口与脱敏视图订阅
utils/
  board.js                      棋盘与胜负基础规则
  gomokuAi.js                   本地人机候选点、胜负优先与攻防评分
  onlineGameState.js            联机状态映射
  clipboard.js                  房间号复制、自动识别与 Toast 反馈
  share.js                      好友邀请参数、分享入口房间号解析
  playerSession.js              微信身份与玩家头像昵称本地状态
cloudfunctions/
  login/                        获取玩家 OpenID
  roomAction/                   创建、加入、落子、重开、退出的服务端裁判
```

数据流：

```text
Canvas 场景
  → roomService
  → login / roomAction 云函数
  → rooms 私有裁判数据（仅云函数可读写）
  → roomViews 脱敏实时视图（客户端只读）
  → 数据库 watch
  → 双方场景同步刷新
```

本地人机：

```text
AiGameScene（玩家黑棋先手）
  → gomokuAi 收集已有棋子两格范围内候选点
  → 优先 AI 立即获胜 / 强制拦截玩家五连
  → 活四、冲四、活三和中心位置综合评分
  → AI 白棋落子并在本地完成胜负判定
```

人机对局不调用云函数、不写云数据库，也不依赖在线玩家数量。

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
- 主色：墨玉绿；强调色：朱红与棋盘金；背景：暖米白；中性卡片使用纸张白与便签米色。
- 页面组件统一复用 `theme.js`、`cardRenderer.js`、`buttonRenderer.js`。
- 交互层级：每页只有一个最主要操作；复制、返回、离开均使用次级样式。
- 文案定位：中文、短句、对局感明确，不使用密码式房间号占位。

## 登录与玩家资料

```text
首页微信快捷登录
  → wx.createUserInfoButton（玩家主动授权）
  → login 云函数获取 OpenID
  → 微信昵称 / 微信头像
  → playerSession 本地持久化
```

- 玩家拒绝昵称头像授权时仍可使用系统默认头像继续游戏。
- 玩家资料页支持微信头像昵称、相册自选头像、系统默认头像和自定义游戏昵称。
- 相册头像通过 `FileSystemManager.saveFile` 保存到小游戏本地文件沙箱。
- OpenID 不显示给其他玩家，仅用于识别同一微信用户。

## 再来一局状态机

```text
finished
  → 一方点击：记录 restartReady，保持结束棋盘并锁定
  → 双方点击：清盘并进入 playing
  → 任一方退出：清除 restartReady，剩余玩家不可继续落子
```

再战确认、退出和落子均由 `roomAction` 事务校验，客户端不能直接修改房间状态。

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

迁移前的普通小程序源码已归档到工程外，当前仓库不再保留这些发布无效入口。新功能应进入 `game/`、`services/`、`utils/` 或 `cloudfunctions/`。

## 当前外部资源

- 正式小游戏 AppID：`wx08c6484b52864efa`
- 正式云环境：`cloud1-d3glf789q33b91507`
- 数据库集合：`rooms`（私有）、`roomViews`（脱敏只读视图）
- 云函数：`login`、`roomAction`
