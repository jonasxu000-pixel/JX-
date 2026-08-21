const INTERNAL_ERROR_PATTERNS = [
  /\b(error|exception|stack|trace|system error)\b/i,
  /\b(errcode|errno|requestid|request id)\b/i,
  /\bat\s+[\w$.<>]+\s*\(/i,
];

function readErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  return String(error.message || error.errMsg || '').trim();
}

function isSafeBusinessMessage(message) {
  return message.length > 0
    && message.length <= 42
    && /[\u3400-\u9fff]/.test(message)
    && !INTERNAL_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

function withRetryHint(fallbackMessage) {
  const message = String(fallbackMessage || '操作失败').trim().replace(/[，。；、！？!?,;]+$/, '');
  return `${message}，请稍后重试`;
}

function toUserMessage(error, fallbackMessage = '操作失败') {
  const rawMessage = readErrorMessage(error);

  if (/appid\s*missing/i.test(rawMessage)) {
    return '当前开发环境未绑定正式 AppID，请重新打开项目后再试';
  }

  if (/collection.+(not\s*exist|does\s*not\s*exist)|集合.+不存在/i.test(rawMessage)) {
    return '房间服务尚未初始化，请联系管理员后重试';
  }

  if (/permission\s*denied|permission.+fail|没有权限|无权限/i.test(rawMessage)) {
    return '房间服务权限异常，请联系管理员后重试';
  }

  if (/cloud\s*function.+(not\s*found|unavailable)|function.+not\s*exist|云函数.+不存在/i.test(rawMessage)) {
    return '房间服务暂时不可用，请稍后重试';
  }

  if (/timeout|timed\s*out|network|request:fail|socket|连接超时|网络/i.test(rawMessage)) {
    return '网络连接不稳定，请检查网络后重试';
  }

  if (/env(?:ironment)?\s*(?:missing|not\s*found|invalid)|云环境.+(?:未连接|不存在)/i.test(rawMessage)) {
    return '云环境未连接，请检查开发者工具的云开发环境';
  }

  if (isSafeBusinessMessage(rawMessage)) return rawMessage;
  return withRetryHint(fallbackMessage);
}

module.exports = {
  toUserMessage,
};
