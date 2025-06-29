// متغيرات البروفايل
let currentUser = '';
let userData = null;

// تحميل البيانات عند فتح الصفحة
document.addEventListener('DOMContentLoaded', function() {
    currentUser = localStorage.getItem('user');
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('current-user').textContent = currentUser;
    loadProfileData();
    updateRequestBadge();
    setupRealtimeSubscription();
});

// إعداد الاشتراك في الوقت الحقيقي
function setupRealtimeSubscription() {
    supabase
        .channel('invitations')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'invitations' 
        }, (payload) => {
            if (payload.new && payload.new.receiver === currentUser && payload.new.status === 'pending') {
                updateRequestBadge();
            }
        })
        .subscribe();
}

// تحديث شارة الطلبات
async function updateRequestBadge() {
    try {
        const { data, error } = await supabase
            .from('invitations')
            .select('*')
            .eq('receiver', currentUser)
            .eq('status', 'pending');
            
        const badge = document.getElementById('request-badge');
        if (data && data.length > 0) {
            badge.textContent = data.length;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    } catch (error) {
        console.error('خطأ في تحديث شارة الطلبات:', error);
    }
}

// تحميل بيانات البروفايل
async function loadProfileData() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', currentUser)
            .single();
            
        if (error) {
            console.error('خطأ في تحميل البيانات:', error);
            return;
        }
        
        userData = data;
        displayProfileData();
        calculateAchievements();
        
    } catch (error) {
        console.error('خطأ في الاتصال:', error);
    }
}

// عرض بيانات البروفايل
function displayProfileData() {
    if (!userData) return;
    
    // عرض اسم المستخدم
    document.getElementById('profile-username').textContent = userData.username;
    document.getElementById('avatar-text').textContent = userData.username.charAt(0).toUpperCase();
    
    // عرض تاريخ الإنشاء
    const createdDate = new Date(userData.created_at);
    const dateString = createdDate.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('profile-date').textContent = `انضم في ${dateString}`;
    
    // عرض الإحصائيات
    const wins = userData.wins || 0;
    const losses = userData.losses || 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    
    document.getElementById('wins-count').textContent = wins;
    document.getElementById('losses-count').textContent = losses;
    document.getElementById('win-rate').textContent = `${winRate}%`;
}

// حساب الإنجازات
function calculateAchievements() {
    if (!userData) return;
    
    const wins = userData.wins || 0;
    const losses = userData.losses || 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    
    let bestAchievement = '-';
    
    if (wins >= 10) {
        bestAchievement = 'محترف XO';
    } else if (wins >= 5) {
        bestAchievement = 'لاعب متقدم';
    } else if (wins >= 1) {
        bestAchievement = 'لاعب مبتدئ';
    } else if (totalGames > 0) {
        bestAchievement = 'لاعب جديد';
    }
    
    if (winRate >= 80 && totalGames >= 5) {
        bestAchievement = 'أسطورة XO';
    } else if (winRate >= 60 && totalGames >= 3) {
        bestAchievement = 'محترف';
    }
    
    document.getElementById('best-achievement').textContent = bestAchievement;
    
    // عرض آخر لعب (نستخدم تاريخ الإنشاء كبديل)
    const lastPlayed = new Date(userData.created_at);
    const lastPlayedString = lastPlayed.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('last-played').textContent = lastPlayedString;
}

// عرض نافذة الطلبات
async function showRequests() {
    try {
        const { data, error } = await supabase
            .from('invitations')
            .select('*')
            .eq('receiver', currentUser)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
            
        const requestsList = document.getElementById('requests-list');
        
        if (data && data.length > 0) {
            requestsList.innerHTML = data.map(invitation => `
                <div class="request-item">
                    <div class="request-header">
                        <span class="request-sender">${invitation.sender}</span>
                        <span class="request-time">${formatTime(invitation.created_at)}</span>
                    </div>
                    <div class="request-actions">
                        <button class="btn-accept" onclick="acceptRequest('${invitation.id}', '${invitation.sender}')">قبول</button>
                        <button class="btn-decline" onclick="declineRequest('${invitation.id}')">رفض</button>
                    </div>
                </div>
            `).join('');
        } else {
            requestsList.innerHTML = `
                <div class="no-requests">
                    <div class="no-requests-icon">📨</div>
                    <p>لا توجد طلبات لعب جديدة</p>
                </div>
            `;
        }
        
        document.getElementById('requests-modal').style.display = 'block';
        
    } catch (error) {
        console.error('خطأ في تحميل الطلبات:', error);
    }
}

// إغلاق نافذة الطلبات
function closeRequests() {
    document.getElementById('requests-modal').style.display = 'none';
}

// قبول طلب من النافذة
async function acceptRequest(invitationId, sender) {
    try {
        // تحديث حالة الدعوة
        await supabase
            .from('invitations')
            .update({ status: 'accepted' })
            .eq('id', invitationId);
            
        updateRequestBadge();
        closeRequests();
        
        // الانتقال إلى صفحة اللعبة
        window.location.href = 'game.html';
        
    } catch (error) {
        alert('خطأ في قبول الدعوة');
    }
}

// رفض طلب من النافذة
async function declineRequest(invitationId) {
    try {
        await supabase
            .from('invitations')
            .update({ status: 'declined' })
            .eq('id', invitationId);
        updateRequestBadge();
        showRequests(); // إعادة تحميل القائمة
    } catch (error) {
        console.error('خطأ في رفض الدعوة:', error);
    }
}

// تنسيق الوقت
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // أقل من دقيقة
        return 'الآن';
    } else if (diff < 3600000) { // أقل من ساعة
        const minutes = Math.floor(diff / 60000);
        return `منذ ${minutes} دقيقة`;
    } else if (diff < 86400000) { // أقل من يوم
        const hours = Math.floor(diff / 3600000);
        return `منذ ${hours} ساعة`;
    } else {
        return date.toLocaleDateString('ar-SA');
    }
}

// تغيير كلمة المرور
function changePassword() {
    const newPassword = prompt('أدخل كلمة المرور الجديدة:');
    if (!newPassword) return;
    
    if (newPassword.length < 6) {
        alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
        return;
    }
    
    updatePassword(newPassword);
}

// تحديث كلمة المرور في قاعدة البيانات
async function updatePassword(newPassword) {
    try {
        const { error } = await supabase
            .from('users')
            .update({ password: newPassword })
            .eq('username', currentUser);
            
        if (error) {
            alert('خطأ في تحديث كلمة المرور: ' + error.message);
        } else {
            alert('تم تحديث كلمة المرور بنجاح');
        }
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

// تصدير البيانات
function exportData() {
    if (!userData) return;
    
    const exportData = {
        username: userData.username,
        wins: userData.wins || 0,
        losses: userData.losses || 0,
        totalGames: (userData.wins || 0) + (userData.losses || 0),
        winRate: calculateWinRate(),
        joinDate: userData.created_at,
        exportDate: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `seemzza-profile-${userData.username}.json`;
    link.click();
    
    alert('تم تصدير البيانات بنجاح');
}

// حساب نسبة الفوز
function calculateWinRate() {
    if (!userData) return 0;
    const wins = userData.wins || 0;
    const losses = userData.losses || 0;
    const totalGames = wins + losses;
    return totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
}

// حذف الحساب
function deleteAccount() {
    const confirmDelete = confirm('هل أنت متأكد من حذف الحساب؟ هذا الإجراء لا يمكن التراجع عنه.');
    if (!confirmDelete) return;
    
    const password = prompt('أدخل كلمة المرور للتأكيد:');
    if (!password) return;
    
    deleteUserAccount(password);
}

// حذف الحساب من قاعدة البيانات
async function deleteUserAccount(password) {
    try {
        // التحقق من كلمة المرور أولاً
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', currentUser)
            .eq('password', password)
            .single();
            
        if (error || !data) {
            alert('كلمة المرور غير صحيحة');
            return;
        }
        
        // حذف جميع البيانات المرتبطة بالمستخدم
        await supabase
            .from('invitations')
            .delete()
            .or(`sender.eq.${currentUser},receiver.eq.${currentUser}`);
            
        await supabase
            .from('moves')
            .delete()
            .eq('player', currentUser);
            
        // حذف المستخدم
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('username', currentUser);
            
        if (deleteError) {
            alert('خطأ في حذف الحساب: ' + deleteError.message);
        } else {
            alert('تم حذف الحساب بنجاح');
            localStorage.removeItem('user');
            localStorage.removeItem('gameState');
            window.location.href = 'index.html';
        }
        
    } catch (error) {
        alert('خطأ في الاتصال');
    }
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