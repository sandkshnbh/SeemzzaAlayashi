// متغيرات اللعبة
let currentUser = '';
let gameState = {
    board: ['', '', '', '', '', '', '', '', ''],
    currentPlayer: 'X',
    gameActive: false,
    gameId: null,
    opponent: null,
    mySymbol: null,
    lastMoveTime: 0
};

let gameTimer = null;
let gameStartTime = null;
let moveCount = 0;
let winStreak = 0;
let lastMoveTime = null;

// التحقق من تسجيل الدخول عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    currentUser = localStorage.getItem('user');
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('current-user').textContent = currentUser;
    setupRealtimeSubscription();
    checkForInvitations();
    loadGameState();
    updateRequestBadge();
});

// تحميل حالة اللعبة المحفوظة
function loadGameState() {
    const savedState = localStorage.getItem('gameState');
    if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.gameId && parsed.gameActive) {
            gameState = parsed;
            updateGameDisplay();
        }
    }
}

// حفظ حالة اللعبة
function saveGameState() {
    localStorage.setItem('gameState', JSON.stringify(gameState));
}

// إعداد الاشتراك في الوقت الحقيقي
function setupRealtimeSubscription() {
    supabase
        .channel('game-moves')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'moves' 
        }, (payload) => {
            if (payload.new && payload.new.game_id === gameState.gameId) {
                updateBoardFromMove(payload.new);
            }
        })
        .subscribe();

    supabase
        .channel('invitations')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'invitations' 
        }, (payload) => {
            if (payload.new && payload.new.receiver === currentUser && payload.new.status === 'pending') {
                handleIncomingInvitation(payload.new);
                updateRequestBadge();
            }
        })
        .subscribe();
}

// تحديث شارة الطلبات
async function updateRequestBadge() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { count } = await supabase
            .from('invitations')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', user.id)
            .eq('status', 'pending');

        const badge = document.getElementById('request-badge');
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error updating request badge:', error);
    }
}

// إرسال دعوة للعب
async function sendInvite() {
    const friendUsername = document.getElementById('friend-username').value.trim();
    
    if (!friendUsername) {
        showStatus('يرجى إدخال اسم المستخدم', 'error');
        return;
    }
    
    if (friendUsername === currentUser) {
        showStatus('لا يمكنك دعوة نفسك', 'error');
        return;
    }
    
    try {
        // التحقق من وجود المستخدم
        const { data: userCheck, error: userError } = await supabase
            .from('users')
            .select('username')
            .eq('username', friendUsername)
            .single();
            
        if (userError || !userCheck) {
            showStatus('اسم المستخدم غير موجود', 'error');
            return;
        }
        
        // التحقق من عدم وجود دعوة معلقة
        const { data: existingInvite, error: inviteError } = await supabase
            .from('invitations')
            .select('*')
            .or(`and(sender.eq.${currentUser},receiver.eq.${friendUsername},status.eq.pending),and(sender.eq.${friendUsername},receiver.eq.${currentUser},status.eq.pending)`)
            .single();
            
        if (existingInvite) {
            showStatus('يوجد دعوة معلقة بالفعل', 'error');
            return;
        }
        
        const { data, error } = await supabase
            .from('invitations')
            .insert([{
                sender: currentUser,
                receiver: friendUsername,
                status: 'pending'
            }]);
            
        if (error) {
            showStatus('خطأ في إرسال الدعوة: ' + error.message, 'error');
        } else {
            showStatus('تم إرسال الدعوة بنجاح', 'success');
            document.getElementById('friend-username').value = '';
        }
    } catch (error) {
        showStatus('خطأ في الاتصال', 'error');
    }
}

// التحقق من الدعوات الواردة
async function checkForInvitations() {
    try {
        const { data, error } = await supabase
            .from('invitations')
            .select('*')
            .eq('receiver', currentUser)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
            
        if (data && data.length > 0) {
            const invitation = data[0];
            handleIncomingInvitation(invitation);
        }
    } catch (error) {
        console.error('خطأ في التحقق من الدعوات:', error);
    }
}

// معالجة الدعوة الواردة
function handleIncomingInvitation(invitation) {
    const accept = confirm(`${invitation.sender} يدعوك للعب. هل تقبل؟`);
    
    if (accept) {
        acceptInvitation(invitation.id);
    } else {
        declineInvitation(invitation.id);
    }
}

// قبول الدعوة
async function acceptInvitation(invitationId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // الحصول على معلومات الدعوة
        const { data: invitation } = await supabase
            .from('invitations')
            .select('*')
            .eq('id', invitationId)
            .single();

        if (!invitation) {
            showMessage('الدعوة غير موجودة', 'error');
            return;
        }

        // بدء اللعبة
        await startGame(invitation);
        
        // إغلاق النافذة
        closeRequests();
        
        showMessage('تم قبول الدعوة وبدء اللعبة!', 'success');
        
    } catch (error) {
        console.error('Error accepting invitation:', error);
        showMessage('خطأ في قبول الدعوة', 'error');
    }
}

// رفض الدعوة
async function declineInvitation(invitationId) {
    try {
        await supabase
            .from('invitations')
            .update({ status: 'declined' })
            .eq('id', invitationId);

        showMessage('تم رفض الدعوة', 'info');
        
        // إعادة تحميل قائمة الطلبات
        showRequests();
        
    } catch (error) {
        console.error('Error declining invitation:', error);
        showMessage('خطأ في رفض الدعوة', 'error');
    }
}

// عرض نافذة الطلبات
async function showRequests() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: invitations } = await supabase
            .from('invitations')
            .select(`
                *,
                sender:users!invitations_sender_id_fkey(username)
            `)
            .eq('receiver_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        const requestsList = document.getElementById('requests-list');
        
        if (invitations && invitations.length > 0) {
            requestsList.innerHTML = invitations.map(invitation => `
                <div class="request-item">
                    <div class="request-header">
                        <div class="request-sender">${invitation.sender?.username || 'مستخدم غير معروف'}</div>
                        <div class="request-time">${formatTime(invitation.created_at)}</div>
                    </div>
                    <div class="request-actions">
                        <button onclick="acceptInvitation('${invitation.id}')" class="btn-accept">
                            <span class="btn-icon">✅</span>
                            <span class="btn-text">قبول</span>
                        </button>
                        <button onclick="declineInvitation('${invitation.id}')" class="btn-decline">
                            <span class="btn-icon">❌</span>
                            <span class="btn-text">رفض</span>
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            requestsList.innerHTML = `
                <div class="no-requests">
                    <div class="no-requests-icon">📨</div>
                    <p>لا توجد دعوات جديدة</p>
                </div>
            `;
        }

        const modal = document.getElementById('requests-modal');
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('show'), 10);
        
        // إخفاء الشارة
        document.getElementById('request-badge').style.display = 'none';
        
    } catch (error) {
        console.error('Error loading requests:', error);
        showMessage('خطأ في تحميل الطلبات', 'error');
    }
}

// إغلاق نافذة الطلبات
function closeRequests() {
    const modal = document.getElementById('requests-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

// تنسيق الوقت
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;
    
    return date.toLocaleDateString('ar-SA');
}

// تحديث عرض اللعبة
function updateGameDisplay() {
    if (gameState.gameActive) {
        document.getElementById('game-info').textContent = `اللعب مع ${gameState.opponent}`;
        document.getElementById('current-turn').textContent = 
            gameState.currentPlayer === gameState.mySymbol ? 'دورك أنت' : `دور ${gameState.opponent}`;
    } else {
        document.getElementById('game-info').textContent = 'اختر صديقًا للعب';
        document.getElementById('current-turn').textContent = '';
    }
    
    // تحديث اللوحة
    gameState.board.forEach((cell, index) => {
        const cellElement = document.querySelector(`[data-index="${index}"]`);
        cellElement.textContent = cell;
        cellElement.classList.remove('x', 'o');
        if (cell) {
            cellElement.classList.add(cell.toLowerCase());
        }
    });
}

// عمل حركة في اللعبة
async function makeMove(index) {
    if (!gameState.gameActive || 
        gameState.board[index] !== '' || 
        gameState.currentPlayer !== gameState.mySymbol ||
        Date.now() - gameState.lastMoveTime < 500) {
        return;
    }
    
    const symbol = gameState.currentPlayer;
    gameState.board[index] = symbol;
    gameState.lastMoveTime = Date.now();
    
    // تحديث الواجهة فوراً
    const cell = document.querySelector(`[data-index="${index}"]`);
    cell.textContent = symbol;
    cell.classList.add(symbol.toLowerCase());
    
    // حفظ الحركة في قاعدة البيانات
    try {
        await supabase
            .from('moves')
            .insert([{
                game_id: gameState.gameId,
                player: currentUser,
                position: index,
                symbol: symbol
            }]);
            
        // تبديل اللاعب
        gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
        updateGameDisplay();
        saveGameState();
            
        // التحقق من الفوز
        if (checkWinner()) {
            endGame(symbol);
        } else if (gameState.board.every(cell => cell !== '')) {
            endGame('draw');
        }
        
    } catch (error) {
        showStatus('خطأ في حفظ الحركة', 'error');
        // إعادة تعيين الحركة في حالة الخطأ
        gameState.board[index] = '';
        cell.textContent = '';
        cell.classList.remove(symbol.toLowerCase());
    }
}

// تحديث اللوحة من حركة أخرى
function updateBoardFromMove(move) {
    if (move.player !== currentUser && move.game_id === gameState.gameId) {
        gameState.board[move.position] = move.symbol;
        
        const cell = document.querySelector(`[data-index="${move.position}"]`);
        cell.textContent = move.symbol;
        cell.classList.add(move.symbol.toLowerCase());
        
        gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
        updateGameDisplay();
        saveGameState();
            
        if (checkWinner()) {
            endGame(move.symbol);
        } else if (gameState.board.every(cell => cell !== '')) {
            endGame('draw');
        }
    }
}

// التحقق من الفوز
function checkWinner() {
    const winConditions = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // أفقي
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // عمودي
        [0, 4, 8], [2, 4, 6] // قطري
    ];
    
    for (let condition of winConditions) {
        const [a, b, c] = condition;
        if (gameState.board[a] && 
            gameState.board[a] === gameState.board[b] && 
            gameState.board[a] === gameState.board[c]) {
            return true;
        }
    }
    return false;
}

// إنهاء اللعبة
function endGame(result) {
    gameState.gameActive = false;
    
    if (result === 'draw') {
        document.getElementById('game-info').textContent = 'تعادل!';
        document.getElementById('current-turn').textContent = '';
    } else {
        const winner = result === gameState.mySymbol ? currentUser : gameState.opponent;
        document.getElementById('game-info').textContent = `الفائز: ${winner}!`;
        document.getElementById('current-turn').textContent = '';
        
        // تحديث الإحصائيات
        updateStats(result === gameState.mySymbol ? 'win' : 'loss');
    }
    
    // مسح حالة اللعبة المحفوظة
    localStorage.removeItem('gameState');
}

// إعادة تعيين اللعبة
function resetGame() {
    gameState = {
        board: ['', '', '', '', '', '', '', '', ''],
        currentPlayer: 'X',
        gameActive: false,
        gameId: null,
        opponent: null,
        mySymbol: null,
        lastMoveTime: 0
    };
    
    // مسح اللوحة
    document.querySelectorAll('.cell').forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o');
    });
    
    document.getElementById('game-info').textContent = 'اختر صديقًا للعب';
    document.getElementById('current-turn').textContent = '';
    showStatus('', '');
    
    // مسح حالة اللعبة المحفوظة
    localStorage.removeItem('gameState');
}

// تحديث الإحصائيات
async function updateStats(result) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('wins, losses')
            .eq('username', currentUser)
            .single();
            
        if (data) {
            const updates = {};
            if (result === 'win') {
                updates.wins = (data.wins || 0) + 1;
            } else {
                updates.losses = (data.losses || 0) + 1;
            }
            
            await supabase
                .from('users')
                .update(updates)
                .eq('username', currentUser);
        }
    } catch (error) {
        console.error('خطأ في تحديث الإحصائيات:', error);
    }
}

// عرض رسالة الحالة
function showStatus(message, type) {
    const statusDiv = document.getElementById('invite-status');
    statusDiv.textContent = message;
    statusDiv.className = type ? type : '';
}

// تسجيل الخروج
function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('gameState');
    window.location.href = 'index.html';
}

// إغلاق النافذة عند النقر خارجها
window.onclick = function(event) {
    const modal = document.getElementById('requests-modal');
    if (event.target === modal) {
        closeRequests();
    }
}

// تحديث إحصائيات المستخدم
async function updateUserStats() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: stats } = await supabase
            .from('users')
            .select('wins, losses')
            .eq('id', user.id)
            .single();

        if (stats) {
            document.getElementById('user-wins').textContent = stats.wins || 0;
            document.getElementById('user-losses').textContent = stats.losses || 0;
        }
    } catch (error) {
        console.error('Error updating user stats:', error);
    }
}

// بدء مؤقت اللعبة
function startGameTimer() {
    gameStartTime = Date.now();
    gameTimer = setInterval(updateGameTimer, 1000);
}

// إيقاف مؤقت اللعبة
function stopGameTimer() {
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
}

// تحديث مؤقت اللعبة
function updateGameTimer() {
    if (!gameStartTime) return;
    
    const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    
    document.getElementById('game-time').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// تحديث عدد الحركات
function updateMoveCount() {
    moveCount++;
    document.getElementById('move-count').textContent = moveCount;
}

// إعادة تعيين إحصائيات اللعبة
function resetGameStats() {
    moveCount = 0;
    document.getElementById('move-count').textContent = '0';
    document.getElementById('game-time').textContent = '00:00';
    stopGameTimer();
}

// عرض نافذة النتيجة
function showResultModal(result, winner = null) {
    const modal = document.getElementById('result-modal');
    const resultTitle = document.getElementById('result-title');
    const resultIcon = document.getElementById('result-icon');
    const resultMessage = document.getElementById('result-message');
    const resultTime = document.getElementById('result-time');
    const resultMoves = document.getElementById('result-moves');

    // إيقاف المؤقت
    stopGameTimer();
    
    // تحديث الإحصائيات
    resultTime.textContent = document.getElementById('game-time').textContent;
    resultMoves.textContent = moveCount;

    if (result === 'win') {
        resultTitle.textContent = '🎉 مبروك! فزت!';
        resultIcon.textContent = '🏆';
        resultMessage.textContent = 'أحسنت! لقد فزت باللعبة';
        winStreak++;
        document.getElementById('win-streak').textContent = winStreak;
    } else if (result === 'lose') {
        resultTitle.textContent = '😔 خسرت';
        resultIcon.textContent = '💔';
        resultMessage.textContent = 'حاول مرة أخرى في المرة القادمة';
        winStreak = 0;
        document.getElementById('win-streak').textContent = '0';
    } else if (result === 'draw') {
        resultTitle.textContent = '🤝 تعادل';
        resultIcon.textContent = '⚖️';
        resultMessage.textContent = 'اللعبة انتهت بالتعادل';
    }

    modal.style.display = 'block';
    setTimeout(() => modal.classList.add('show'), 10);
}

// إغلاق نافذة النتيجة
function closeResult() {
    const modal = document.getElementById('result-modal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = 'none', 300);
}

// لعب مرة أخرى
function playAgain() {
    closeResult();
    resetGame();
}

// تراجع عن الحركة الأخيرة
function undoMove() {
    if (gameState.moves.length === 0) return;
    
    const lastMove = gameState.moves[gameState.moves.length - 1];
    const cell = document.querySelector(`[data-index="${lastMove.position}"]`);
    
    // إزالة الحركة من الخلية
    cell.removeAttribute('data-symbol');
    cell.querySelector('.cell-content').textContent = '';
    
    // إزالة الحركة من قاعدة البيانات
    supabase
        .from('moves')
        .delete()
        .eq('id', lastMove.id);
    
    // تحديث حالة اللعبة
    gameState.board[lastMove.position] = '';
    gameState.moves.pop();
    gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
    
    // تحديث واجهة المستخدم
    updateGameDisplay();
    updateMoveCount();
    
    // إخفاء زر التراجع إذا لم تتبق حركات
    if (gameState.moves.length === 0) {
        document.getElementById('undo-btn').style.display = 'none';
    }
}

// تحسين دالة makeMove
async function makeMove(position) {
    if (!gameState.isActive || gameState.board[position] !== '') return;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // التحقق من أن اللاعب الحالي هو من يلعب
    const isPlayerX = gameState.playerX === user.id;
    const isPlayerO = gameState.playerO === user.id;
    const currentSymbol = isPlayerX ? 'X' : (isPlayerO ? 'O' : null);
    
    if (!currentSymbol || gameState.currentPlayer !== currentSymbol) {
        showMessage('ليس دورك للعب', 'error');
        return;
    }

    try {
        // إضافة الحركة إلى قاعدة البيانات
        const { data: move, error } = await supabase
            .from('moves')
            .insert({
                game_id: gameState.gameId,
                player_id: user.id,
                position: position,
                symbol: currentSymbol
            })
            .select()
            .single();

        if (error) throw error;

        // تحديث حالة اللعبة
        gameState.board[position] = currentSymbol;
        gameState.moves.push(move);
        gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';

        // تحديث واجهة المستخدم
        updateGameDisplay();
        updateMoveCount();
        
        // إظهار زر التراجع
        document.getElementById('undo-btn').style.display = 'flex';

        // التحقق من الفوز أو التعادل
        const winner = checkWinner();
        if (winner) {
            gameState.isActive = false;
            await endGame(winner);
        } else if (gameState.board.every(cell => cell !== '')) {
            gameState.isActive = false;
            await endGame('draw');
        }

    } catch (error) {
        console.error('Error making move:', error);
        showMessage('خطأ في إضافة الحركة', 'error');
    }
}

// تحسين دالة endGame
async function endGame(winner) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // تحديث حالة اللعبة
        await supabase
            .from('games')
            .update({ 
                status: 'finished',
                winner: winner === 'draw' ? null : winner,
                ended_at: new Date().toISOString()
            })
            .eq('id', gameState.gameId);

        // تحديث إحصائيات اللاعبين
        if (winner !== 'draw') {
            const winnerId = winner === 'X' ? gameState.playerX : gameState.playerO;
            const loserId = winner === 'X' ? gameState.playerO : gameState.playerX;

            // تحديث فائز
            await supabase
                .from('users')
                .update({ wins: supabase.sql`wins + 1` })
                .eq('id', winnerId);

            // تحديث خاسر
            await supabase
                .from('users')
                .update({ losses: supabase.sql`losses + 1` })
                .eq('id', loserId);
        }

        // تحديث إحصائيات المستخدم الحالي
        await updateUserStats();

        // عرض النتيجة
        if (winner === 'draw') {
            showResultModal('draw');
        } else {
            const isWinner = (winner === 'X' && gameState.playerX === user.id) ||
                           (winner === 'O' && gameState.playerO === user.id);
            showResultModal(isWinner ? 'win' : 'lose');
        }

        // تحديث وضع اللعبة
        document.getElementById('game-mode').textContent = 'وضع اللعب: منتهية';
        document.getElementById('game-mode').className = 'game-mode finished';

    } catch (error) {
        console.error('Error ending game:', error);
    }
}

// تحسين دالة startGame
async function startGame(invitation) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // إنشاء لعبة جديدة
        const { data: game, error } = await supabase
            .from('games')
            .insert({
                player_x: user.id,
                player_o: invitation.sender_id,
                status: 'active',
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // تحديث الدعوة
        await supabase
            .from('invitations')
            .update({ status: 'accepted' })
            .eq('id', invitation.id);

        // تهيئة حالة اللعبة
        gameState = {
            gameId: game.id,
            playerX: game.player_x,
            playerO: game.player_o,
            currentPlayer: 'X',
            board: ['', '', '', '', '', '', '', '', ''],
            moves: [],
            isActive: true
        };

        // تحديث واجهة المستخدم
        updateGameDisplay();
        updatePlayerNames();
        
        // بدء المؤقت
        startGameTimer();
        resetGameStats();
        
        // تحديث وضع اللعبة
        document.getElementById('game-mode').textContent = 'وضع اللعب: نشط';
        document.getElementById('game-mode').className = 'game-mode active';

        // إخفاء زر التراجع
        document.getElementById('undo-btn').style.display = 'none';

    } catch (error) {
        console.error('Error starting game:', error);
        showMessage('خطأ في بدء اللعبة', 'error');
    }
}

// تحديث أسماء اللاعبين
async function updatePlayerNames() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // الحصول على معلومات اللاعبين
        const playerIds = [gameState.playerX, gameState.playerO].filter(id => id);
        const { data: players } = await supabase
            .from('users')
            .select('id, username')
            .in('id', playerIds);

        if (players) {
            const playerX = players.find(p => p.id === gameState.playerX);
            const playerO = players.find(p => p.id === gameState.playerO);

            document.getElementById('player-x-name').textContent = 
                playerX ? playerX.username : 'اللاعب X';
            document.getElementById('player-o-name').textContent = 
                playerO ? playerO.username : 'اللاعب O';
        }
    } catch (error) {
        console.error('Error updating player names:', error);
    }
}

// تحسين دالة updateGameDisplay
function updateGameDisplay() {
    // تحديث لوحة اللعب
    gameState.board.forEach((cell, index) => {
        const cellElement = document.querySelector(`[data-index="${index}"]`);
        const contentElement = cellElement.querySelector('.cell-content');
        
        if (cell) {
            cellElement.setAttribute('data-symbol', cell);
            contentElement.textContent = cell;
        } else {
            cellElement.removeAttribute('data-symbol');
            contentElement.textContent = '';
        }
    });

    // تحديث معلومات الدور
    const currentPlayerName = gameState.currentPlayer === 'X' ? 
        document.getElementById('player-x-name').textContent :
        document.getElementById('player-o-name').textContent;
    
    document.getElementById('current-turn').textContent = 
        `دور: ${currentPlayerName} (${gameState.currentPlayer})`;

    // تحديث حالة اللعبة
    if (gameState.isActive) {
        document.getElementById('game-info').textContent = 'اللعبة جارية';
    } else {
        document.getElementById('game-info').textContent = 'اللعبة منتهية';
    }
}

// تحسين دالة resetGame
async function resetGame() {
    try {
        if (gameState.gameId) {
            // إنهاء اللعبة الحالية
            await supabase
                .from('games')
                .update({ 
                    status: 'finished',
                    ended_at: new Date().toISOString()
                })
                .eq('id', gameState.gameId);
        }

        // إعادة تعيين حالة اللعبة
        gameState = {
            gameId: null,
            playerX: null,
            playerO: null,
            currentPlayer: 'X',
            board: ['', '', '', '', '', '', '', '', ''],
            moves: [],
            isActive: false
        };

        // إعادة تعيين واجهة المستخدم
        updateGameDisplay();
        resetGameStats();
        
        // إخفاء زر التراجع
        document.getElementById('undo-btn').style.display = 'none';
        
        // إعادة تعيين أسماء اللاعبين
        document.getElementById('player-x-name').textContent = 'أنت';
        document.getElementById('player-o-name').textContent = 'الخصم';
        
        // تحديث وضع اللعبة
        document.getElementById('game-mode').textContent = 'وضع اللعب: انتظار';
        document.getElementById('game-mode').className = 'game-mode waiting';

    } catch (error) {
        console.error('Error resetting game:', error);
    }
}

// تحسين دالة initializeGame
async function initializeGame() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('current-user').textContent = user.email;
        await updateUserStats();

        // الاستماع للتغييرات في اللعبة
        supabase
            .channel('game_changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'moves' },
                handleMoveUpdate
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'games' },
                handleGameUpdate
            )
            .subscribe();

        // الاستماع للدعوات الجديدة
        supabase
            .channel('invitation_changes')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'invitations' },
                handleNewInvitation
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'invitations' },
                handleInvitationUpdate
            )
            .subscribe();

    } catch (error) {
        console.error('Error initializing game:', error);
    }
}

// تحديث دالة handleMoveUpdate
function handleMoveUpdate(payload) {
    if (payload.eventType === 'INSERT' && payload.new.game_id === gameState.gameId) {
        const move = payload.new;
        gameState.board[move.position] = move.symbol;
        gameState.moves.push(move);
        gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
        
        updateGameDisplay();
        updateMoveCount();
        
        // إظهار زر التراجع
        document.getElementById('undo-btn').style.display = 'flex';
        
        // التحقق من الفوز أو التعادل
        const winner = checkWinner();
        if (winner) {
            gameState.isActive = false;
            endGame(winner);
        } else if (gameState.board.every(cell => cell !== '')) {
            gameState.isActive = false;
            endGame('draw');
        }
    } else if (payload.eventType === 'DELETE' && payload.old.game_id === gameState.gameId) {
        // إعادة تحميل اللعبة عند حذف حركة
        loadGame(gameState.gameId);
    }
}

// تحديث دالة handleGameUpdate
function handleGameUpdate(payload) {
    if (payload.new.id === gameState.gameId) {
        if (payload.new.status === 'finished') {
            gameState.isActive = false;
            const winner = payload.new.winner;
            if (winner) {
                endGame(winner);
            } else {
                endGame('draw');
            }
        }
    }
}

// تحديث دالة handleNewInvitation
function handleNewInvitation(payload) {
    if (payload.new.receiver_id === currentUser.id && payload.new.status === 'pending') {
        updateRequestBadge();
        showMessage('دعوة جديدة للعب!', 'info');
    }
}

// تحديث دالة handleInvitationUpdate
function handleInvitationUpdate(payload) {
    if (payload.new.receiver_id === currentUser.id) {
        updateRequestBadge();
    }
}

// تحديث دالة showMessage
function showMessage(message, type = 'info') {
    const statusElement = document.getElementById('invite-status');
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    
    setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = '';
    }, 5000);
}

// تحديث دالة loadGame
async function loadGame(gameId) {
    try {
        const { data: game } = await supabase
            .from('games')
            .select('*')
            .eq('id', gameId)
            .single();

        if (!game) return;

        const { data: moves } = await supabase
            .from('moves')
            .select('*')
            .eq('game_id', gameId)
            .order('created_at', { ascending: true });

        // تهيئة حالة اللعبة
        gameState = {
            gameId: game.id,
            playerX: game.player_x,
            playerO: game.player_o,
            currentPlayer: moves.length % 2 === 0 ? 'X' : 'O',
            board: ['', '', '', '', '', '', '', '', ''],
            moves: moves,
            isActive: game.status === 'active'
        };

        // تحديث اللوحة
        moves.forEach(move => {
            gameState.board[move.position] = move.symbol;
        });

        // تحديث واجهة المستخدم
        updateGameDisplay();
        updatePlayerNames();
        
        if (game.status === 'active') {
            startGameTimer();
            document.getElementById('game-mode').textContent = 'وضع اللعب: نشط';
            document.getElementById('game-mode').className = 'game-mode active';
        } else {
            document.getElementById('game-mode').textContent = 'وضع اللعب: منتهية';
            document.getElementById('game-mode').className = 'game-mode finished';
        }

        // إظهار/إخفاء زر التراجع
        if (moves.length > 0) {
            document.getElementById('undo-btn').style.display = 'flex';
        } else {
            document.getElementById('undo-btn').style.display = 'none';
        }

    } catch (error) {
        console.error('Error loading game:', error);
    }
}

// تحديث دالة checkWinner
function checkWinner() {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // أفقي
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // عمودي
        [0, 4, 8], [2, 4, 6] // قطري
    ];

    for (let line of lines) {
        const [a, b, c] = line;
        if (gameState.board[a] && 
            gameState.board[a] === gameState.board[b] && 
            gameState.board[a] === gameState.board[c]) {
            
            // إضافة تأثير الفوز للخلايا
            line.forEach(index => {
                const cell = document.querySelector(`[data-index="${index}"]`);
                cell.classList.add('winning');
            });
            
            return gameState.board[a];
        }
    }

    return null;
}

// تهيئة اللعبة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    initializeGame();
    updateRequestBadge();
    
    // إغلاق النوافذ المنبثقة عند النقر خارجها
    window.onclick = function(event) {
        const requestsModal = document.getElementById('requests-modal');
        const resultModal = document.getElementById('result-modal');
        
        if (event.target === requestsModal) {
            closeRequests();
        }
        if (event.target === resultModal) {
            closeResult();
        }
    };
}); 