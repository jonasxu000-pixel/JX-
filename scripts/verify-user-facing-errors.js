const { toUserMessage } = require('../utils/userFacingError');
const { fitText } = require('../game/renderers/textRenderer');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyErrorMapping() {
  const rawSystemError = 'check your request, but if the problem cannot be solved: system error (Error: appid missing)';
  const appIdMessage = toUserMessage(new Error(rawSystemError), '创建房间失败');
  assert(appIdMessage.includes('正式 AppID'), 'appid missing must become an actionable Chinese message');
  assert(!appIdMessage.includes('system error'), 'raw system errors must never reach the player');

  assert(
    toUserMessage(new Error('database collection roomViews does not exist'), '创建房间失败')
      === '房间服务尚未初始化，请联系管理员后重试',
    'missing collections must have a stable Chinese message',
  );
  assert(
    toUserMessage(new Error('permission denied for document read'), '房间同步失败')
      === '房间服务权限异常，请联系管理员后重试',
    'permission failures must have a stable Chinese message',
  );
  assert(
    toUserMessage(new Error('request:fail timeout'), '加入失败')
      === '网络连接不稳定，请检查网络后重试',
    'network timeouts must have a retryable Chinese message',
  );
  assert(
    toUserMessage(new Error('房间不存在'), '加入失败') === '房间不存在',
    'short Chinese business errors must remain intact',
  );
  assert(
    toUserMessage(new Error('Error: unexpected internal state at handler (index.js:1)'), '落子失败')
      === '落子失败，请稍后重试',
    'unknown internal errors must use the operation fallback',
  );
}

function verifyTextWidthFallback() {
  const ctx = {
    measureText(value) {
      return { width: String(value).length * 10 };
    },
  };
  assert(fitText(ctx, '短提示', 80) === '短提示', 'short labels must not be changed');
  const fitted = fitText(ctx, '这是一段不应该横向溢出的超长错误信息', 80);
  assert(fitted.endsWith('…'), 'long labels must end with an ellipsis');
  assert(ctx.measureText(fitted).width <= 80, 'fitted labels must stay inside maxWidth');
}

verifyErrorMapping();
verifyTextWidthFallback();
console.log('user-facing error and text overflow checks ok');
