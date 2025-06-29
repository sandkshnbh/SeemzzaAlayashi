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
});

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
            window.location.href = 'index.html';
        }
        
    } catch (error) {
        alert('خطأ في الاتصال');
    }
}

// تسجيل الخروج
function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
} 