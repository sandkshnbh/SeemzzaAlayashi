// تبديل التبويبات
function showTab(tab) {
  document.querySelector('.tab-btn.active').classList.remove('active');
  if (tab === 'login') {
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.getElementById('login-tab').style.display = '';
    document.getElementById('signup-tab').style.display = 'none';
  } else {
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('login-tab').style.display = 'none';
    document.getElementById('signup-tab').style.display = '';
  }
}

// إنشاء حساب
async function handleSignup(e) {
  e.preventDefault();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  if (!username || !password) return;
  const { data, error } = await supabase
    .from('users')
    .insert([{ username, password }]);
  if (error) {
    alert("اسم المستخدم موجود أو فيه خطأ");
  } else {
    localStorage.setItem('user', username);
    window.location.href = "game.html";
  }
}

// تسجيل الدخول
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password);
  if (data && data.length > 0) {
    localStorage.setItem('user', username);
    window.location.href = "game.html";
  } else {
    alert("خطأ في تسجيل الدخول");
  }
} 