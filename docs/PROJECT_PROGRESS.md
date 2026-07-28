# JX双人五子棋 - 项目进度

> 最后更新：2026-07-28

## 2026-07-28 小游戏迁移恢复

### 已确认

- 正式发布目标为已完成微信认证的小游戏账号“你棋没我硬”。
- 正式小游戏 AppID 已绑定到当前 D 盘主仓库。
- 微信开发者工具已将当前工程识别为小游戏：
  - `compileType=game`
  - `gameApp=true`
  - `appType=4`
- 小游戏迁移成果已建立安全提交点：`a2154ca chore: checkpoint mini game migration`。
- 本地小游戏发布门禁通过：
  - JSON 与 JavaScript 语法检查通过
  - 云端房间规则检查通过
  - 联机状态映射检查通过
  - 小游戏 Canvas 运行时检查通过
- 使用正式小游戏 AppID 执行开发者工具预览构建成功，包体约 `95.1 KB`。
- 开发者工具中可见云环境 `cloud1-d8g33m3x28826d0ab`，状态为 `NORMAL`。

### 当前边界

- 当前只确认正式小游戏账号绑定、小游戏构建和本地运行门禁。
- 云环境虽然可见，但尚未在正式小游戏身份下验证云函数调用、数据库监听和双人联机。
- 小游戏备案仍在审核中，暂不提交正式发布。

### 下一步

1. 在正式小游戏身份下验证云函数版本、数据库权限和房间创建链路。
2. 完成小游戏版本机操作抽检与双真机联机验收。
3. 备案通过后补齐发布材料并提交审核。

## 当前阶段

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1. 单机双人五子棋 | 已完成 | Canvas 棋盘、交替落子、胜负判断、悔棋、重新开始 |
| 2. 房间系统 | 已完成 | 创建房间、加入房间、等待页监听、两人进入同一房间 |
| 3. 联机对战闭环 | 已完成并验收 | 房主黑棋、加入者白棋、事务落子、实时监听同步、双方胜负视角 |
| 4. 上线准备 | 已完成 | V1.0 发布候选版自动门禁、云端门禁、双真机体验门禁均已通过 |

## 2026-06-08 进展

### 已完成

- 提交稳定点：`feat: add cloud room sync foundation`
- 联机棋盘改为受控模式：
  - 在线模式下棋盘组件只上报点击坐标
  - 不再提前本地落子
  - 棋盘状态统一由房间监听同步写入
- 游戏页联机逻辑收敛：
  - 前端不再在线判断胜负并二次提交
  - 云函数 `placePiece` 作为唯一落子与胜负裁判
  - 增加在线落子提交防抖，避免连续点击重复提交
  - 对局结束后双方可看到“你获胜/对手获胜”结果弹窗
- 修复进度文件乱码，恢复为唯一可读进度来源
- 服务端落子写入已回退为 `doc(roomId).update()`：
  - 修复真机落子时报 `collection.update:fail -502001 database request`
  - 继续保留写入前的身份、回合、坐标、占位、胜负校验
- 修复 `lastMove` 初始为 `null` 时的数据库更新语义：
  - `lastMove` 使用 `_.set({ row, col, piece, role })` 整体替换
  - `board` 使用 `_.set(nextBoard)` 整体替换
  - 避免云数据库把对象拆成 `lastMove.col` 这类嵌套路径写入
- 新增单人云端自检：
  - 云函数动作：`selfTestMove`
  - 创建临时房间、复用真实 `placePiece` 落子路径写入一手黑棋、读回校验、自动清理
  - 创建房间页新增“云端自检”按钮，先单人确认云端写库链路
  - 已通过开发者工具自动化真实调用：`{"success":true,"version":"roomAction-20260608-self-test-placepiece-1","currentTurn":"guest","lastMove":{"row":7,"col":7,"piece":1,"role":"host"},"piece":1}`
- 修复双人联调会直接踩到的房间元数据问题：
  - 云函数 `createRoom` 恢复生成 6 位数字房间号，和加入页“请输入6位房间号”的交互保持一致
  - 云函数 `createRoom` 返回 `role=host`、`color=black`
  - 云函数 `joinRoom` 返回 `role=guest`、`color=white`，避免加入者进入游戏页后角色变成 `undefined`
- 新增完整云端对局自检：
  - 云函数动作：`selfTestMatch`
  - 临时构造房主/加入者两个玩家，复用真实 `placePiece` 路径轮流落子
  - 校验加入者抢先落子会被拒绝、房主黑棋五连、加入者白棋落子、最终 `winner=host`、`status=finished`
  - 已通过开发者工具自动化真实调用：`{"success":true,"version":"roomAction-20260608-self-test-match-1","moves":9,"winner":"host","status":"finished","hostBlackLine":true,"guestWhiteLine":true,"rejectedGuestEarlyMove":true}`
- 已通过微信开发者工具 CLI 自动部署 `roomAction`：
  - 环境：`cloud1-d8g33m3x28826d0ab`
  - 结果：`roomAction success=true`
  - 当前云函数状态：`Active`
- 前端房间状态映射已抽取为 `utils/onlineGameState.js`：
  - 房主固定黑棋
  - 加入者固定白棋
  - 轮到自己时解锁棋盘
  - 等待对手、对手离开、胜负结果均由统一函数推导

## 2026-06-09 联机闭环验收

### 稳定性修复

- 云端 `placePiece` 改为数据库事务读写，身份、回合、占位、胜负判断与棋盘写入原子执行。
- 针对云数据库 `ResourceUnavailable.TransactionConflict` 增加最多 3 次有限重试：
  - 并发同回合请求只允许一次成功。
  - 失败请求重读最新回合后返回正常业务拒绝，不再暴露事务系统错误。
- 游戏页先同步最终状态与棋盘，再显示“你获胜/对手获胜”弹窗。
- 正常 `joinRoom` 与 `selfTestJoinRoom` 复用同一加入逻辑，避免自检与真实路径分叉。
- 加入房间同样使用数据库事务；多个加入者并发抢房时只允许一个加入成功。

### 自动化验收证据

- 本地完整规则与并发验证：`node scripts/verify-room-action.js`
  - 创建房间固定为 6 位数字，返回 `host/black`。
  - 加入房间返回 `guest/white`，房间进入 `playing`。
  - 房主固定黑棋先手，加入者固定白棋。
  - 非当前回合、重复位置、结束后落子均被拒绝。
  - 房主黑棋五连与加入者白棋五连均正确产生胜负。
  - 并发同回合落子仅一次成功，事务冲突可正常重试。
  - 并发加入同一房间仅一个加入者成功，避免角色覆盖。
- 页面级 watch 与双方视角验证：`node scripts/verify-online-game-page.js`
  - 同一房间更新会同步到房主与加入者棋盘。
  - 每步更新后双方回合锁状态正确。
  - 房主/加入者获胜时，胜方显示“你获胜”，败方显示“对手获胜”。
  - 最终获胜棋子先同步到棋盘，再显示胜负弹窗。
- 前端状态映射验证：`node scripts/verify-online-game-state.js`
- 微信开发者工具真实云端自动化：
  - 环境：`cloud1-d8g33m3x28826d0ab`
  - 云函数版本：`roomAction-20260609-transaction-room-7`
  - 正常创建房间：`roomId=138954`、`role=host`、`color=black`
  - 加入路径并发自检：`role=guest`、`color=white`、`status=playing`、`succeeded=1`、`rejected=1`
  - 完整对局自检：`moves=9`、`winner=host`、`status=finished`
  - 并发事务自检：`succeeded=1`、`rejected=1`、`savedBlackPieces=1`
  - 真实数据库 watch：收到 `board[7][7]=1`、`lastMove=(7,7,host)`、`currentTurn=guest`
  - 全流程未出现 `-502001`、角色错误、棋盘不同步或重复落子。
- 微信开发者工具预览构建通过：包体 `77.1 KB`。

### 验收结论

- 稳定联机对战闭环已完成并通过自动化验收。
- 发布前建议用两台真机做一次最小体验抽检，重点检查网络切换、触控手感与弹窗展示；该抽检不阻塞当前稳定代码点。

## 当前风险

- 小程序云开发监听依赖 `rooms` 集合读权限；若线上监听失败，优先检查数据库权限配置。
- 对手离开后的重开/继续等待策略仍较简单，后续可单独优化。
- 事务冲突连续超过 3 次时会返回错误；正常双人落子与并发自检均未触发该上限。

## 2026-06-09 V1.0 发布候选版收口

### 已完成

- 补齐满盘和棋规则：棋盘下满且无人五连时结束对局，双方显示“和棋”。
- 移除创建房间页的“云端自检”入口及客户端废弃接口。
- 云函数诊断动作默认关闭，仅允许在显式设置 `ENABLE_ROOM_DIAGNOSTICS=true` 时调用。
- 数据库权限方案收口为客户端只读：`read: true`、`write: false`，所有写入统一走 `roomAction`。
- 游戏页与等待页增加房间监听错误退避重连；游戏页从后台恢复时重新拉取房间并建立监听。
- 新增统一自动发布门禁：`node scripts/verify-release.js`。
- 新增发布验收清单：`docs/RELEASE_CHECKLIST_V1.0.md`。
- 微信开发者工具最新预览构建通过，排除本地验收产物后包体 `32.6 KB`。
- 最新 `roomAction` 已成功部署，真实云调用返回版本 `roomAction-20260611-release-candidate-2`。
- 真实云调用确认生产诊断动作已关闭，创建房间与离开清理链路正常。
- 新增线上云环境发布门禁：`node scripts/verify-cloud-release.js`。
- 线上 `rooms` 权限已改为 `read: true`、`write: false`；真实客户端读取成功、直接写入被 `DATABASE_PERMISSION_DENIED` 拒绝。
- 微信打包配置已排除本地 `.codex-preview` 验收产物。
- 双真机一局一房模式反馈稳定。
- 针对真机反馈补齐联机结束后的“再来一局 / 返回首页”入口；“再来一局”复用同一房间并保留双方角色。

### 验收结论

- 双真机同房间“再来一局”复测通过。
- V1.0 发布候选版稳定性验收通过，当前版本具备发布条件。

## 下一步

1. 创建 V1.0 稳定版本提交
2. 后续进入 V1.1 体验增强：房间生命周期优化、战绩/房间清理等
