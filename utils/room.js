/**
 * 房间号工具
 * 生成6位随机数字房间号
 */

/**
 * 生成6位房间号（100000-999999）
 */
function generateRoomId() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 验证房间号格式（6位数字）
 */
function isValidRoomId(id) {
  return /^\d{6}$/.test(id);
}

module.exports = {
  generateRoomId,
  isValidRoomId,
};
