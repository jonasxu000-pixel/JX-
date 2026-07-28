const board = require('./board');

function roleToPiece(role) {
  return role === 'host' ? board.BLACK : board.WHITE;
}

function pieceToRole(piece) {
  return piece === board.BLACK ? 'host' : 'guest';
}

function getWinnerText(winnerRole, myRole) {
  if (!winnerRole) return '';
  return winnerRole === myRole ? '\u4f60\u83b7\u80dc' : '\u5bf9\u624b\u83b7\u80dc';
}

function deriveOnlineGameState(roomData, myRole) {
  if (!roomData) {
    return {
      currentPlayer: board.BLACK,
      statusText: '\u623f\u95f4\u5df2\u4e0d\u5b58\u5728',
      resultText: '\u623f\u95f4\u5df2\u4e0d\u5b58\u5728',
      gameOver: true,
      isMyTurn: false,
      boardLocked: true,
      shouldShowResult: false,
    };
  }

  const currentPlayer = roleToPiece(roomData.currentTurn || 'host');
  const isFinished = roomData.status === 'finished';
  const isWaiting = roomData.status === 'waiting';
  const isMyTurn = roomData.status === 'playing'
    && roomData.currentTurn === myRole
    && !roomData.winner;

  if (isFinished) {
    let resultText = roomData.winner
      ? getWinnerText(roomData.winner, myRole)
      : '\u548c\u68cb';
    if (roomData.finishReason === 'surrender') {
      resultText = roomData.surrenderedBy === myRole
        ? '\u4f60\u5df2\u6295\u964d'
        : '\u5bf9\u624b\u6295\u964d\uff0c\u4f60\u83b7\u80dc';
    }
    return {
      currentPlayer,
      statusText: resultText,
      resultText,
      gameOver: true,
      isMyTurn: false,
      boardLocked: true,
      shouldShowResult: true,
    };
  }

  if (isWaiting) {
    return {
      currentPlayer,
      statusText: '\u5bf9\u624b\u5df2\u79bb\u5f00',
      resultText: '\u5bf9\u624b\u5df2\u79bb\u5f00\u623f\u95f4',
      gameOver: true,
      isMyTurn: false,
      boardLocked: true,
      shouldShowResult: false,
    };
  }

  return {
    currentPlayer,
    statusText: isMyTurn
      ? `\u8f6e\u5230\u4f60\u843d\u5b50\uff08${board.pieceName(currentPlayer)}\uff09`
      : '\u7b49\u5f85\u5bf9\u624b\u843d\u5b50',
    resultText: '',
    gameOver: false,
    isMyTurn,
    boardLocked: !isMyTurn,
    shouldShowResult: false,
  };
}

module.exports = {
  deriveOnlineGameState,
  pieceToRole,
  roleToPiece,
};
