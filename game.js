// متغيرات اللعبة
let currentUser = '';
let gameState = {
    board: ['', '', '', '', '', '', '', '', ''],
    currentPlayer: 'X',
    gameActive: false,
    gameId: null,
    opponent: null
};

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
});

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
            if (payload.new && payload.new.receiver === currentUser) {
                handleIncomingInvitation(payload.new);
            }
        })
        .subscribe();
}

// إرسال دعوة للعب
async function sendInvite() {
    const friendUsername = document.getElementById('friend-username').value.trim();
    const statusDiv = document.getElementById('invite-status');
    
    if (!friendUsername) {
        showStatus('يرجى إدخال اسم المستخدم', 'error');
        return;
    }
    
    if (friendUsername === currentUser) {
        showStatus('لا يمكنك دعوة نفسك', 'error');
        return;
    }
    
    try {
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
            .eq('status', 'pending');
            
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
        acceptInvitation(invitation);
    } else {
        declineInvitation(invitation.id);
    }
}

// قبول الدعوة
async function acceptInvitation(invitation) {
    try {
        // تحديث حالة الدعوة
        await supabase
            .from('invitations')
            .update({ status: 'accepted' })
            .eq('id', invitation.id);
            
        // إنشاء لعبة جديدة
        const gameId = crypto.randomUUID();
        gameState.gameId = gameId;
        gameState.opponent = invitation.sender;
        gameState.gameActive = true;
        gameState.currentPlayer = 'X';
        
        document.getElementById('game-info').textContent = `اللعب مع ${invitation.sender}`;
        document.getElementById('current-turn').textContent = 'دورك أنت (X)';
        
        showStatus('تم قبول الدعوة! ابدأ اللعب', 'success');
        
    } catch (error) {
        showStatus('خطأ في قبول الدعوة', 'error');
    }
}

// رفض الدعوة
async function declineInvitation(invitationId) {
    try {
        await supabase
            .from('invitations')
            .update({ status: 'declined' })
            .eq('id', invitationId);
    } catch (error) {
        console.error('خطأ في رفض الدعوة:', error);
    }
}

// عمل حركة في اللعبة
async function makeMove(index) {
    if (!gameState.gameActive || gameState.board[index] !== '') {
        return;
    }
    
    const symbol = gameState.currentPlayer;
    gameState.board[index] = symbol;
    
    // تحديث الواجهة
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
        document.getElementById('current-turn').textContent = 
            gameState.currentPlayer === 'X' ? 'دورك أنت (X)' : `دور ${gameState.opponent} (O)`;
            
        // التحقق من الفوز
        if (checkWinner()) {
            endGame(symbol);
        } else if (gameState.board.every(cell => cell !== '')) {
            endGame('draw');
        }
        
    } catch (error) {
        showStatus('خطأ في حفظ الحركة', 'error');
    }
}

// تحديث اللوحة من حركة أخرى
function updateBoardFromMove(move) {
    if (move.player !== currentUser) {
        gameState.board[move.position] = move.symbol;
        
        const cell = document.querySelector(`[data-index="${move.position}"]`);
        cell.textContent = move.symbol;
        cell.classList.add(move.symbol.toLowerCase());
        
        gameState.currentPlayer = gameState.currentPlayer === 'X' ? 'O' : 'X';
        document.getElementById('current-turn').textContent = 
            gameState.currentPlayer === 'X' ? 'دورك أنت (X)' : `دور ${gameState.opponent} (O)`;
            
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
        const winner = result === 'X' ? currentUser : gameState.opponent;
        document.getElementById('game-info').textContent = `الفائز: ${winner}!`;
        document.getElementById('current-turn').textContent = '';
        
        // تحديث الإحصائيات
        updateStats(result === 'X' ? 'win' : 'loss');
    }
}

// إعادة تعيين اللعبة
function resetGame() {
    gameState = {
        board: ['', '', '', '', '', '', '', '', ''],
        currentPlayer: 'X',
        gameActive: false,
        gameId: null,
        opponent: null
    };
    
    // مسح اللوحة
    document.querySelectorAll('.cell').forEach(cell => {
        cell.textContent = '';
        cell.classList.remove('x', 'o');
    });
    
    document.getElementById('game-info').textContent = 'اختر صديقًا للعب';
    document.getElementById('current-turn').textContent = '';
    showStatus('', '');
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
    window.location.href = 'index.html';
} 