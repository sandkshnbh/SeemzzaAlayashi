# 🎮 Seemzza Al-ayashi - لعبة XO التفاعلية

لعبة XO تفاعلية على الويب مع مزامنة فورية عبر Supabase Realtime.

## ✨ المميزات

- ✅ تسجيل دخول وإنشاء حساب بسيط
- ✅ واجهة مستخدم أنيقة ومتجاوبة
- ✅ دعوة الأصدقاء للعب عبر اسم المستخدم
- ✅ مزامنة فورية للحركات عبر Supabase Realtime
- ✅ صفحة بروفايل مع إحصائيات اللعب
- ✅ شريط تنقل سفلي للتبديل بين الصفحات

## 🛠️ التقنيات المستخدمة

- **HTML5** - هيكل الصفحات
- **CSS3** - التنسيق والتصميم
- **JavaScript** - منطق اللعبة والتفاعل
- **Supabase** - قاعدة البيانات والمصادقة
- **Supabase Realtime** - المزامنة الفورية

## 📋 متطلبات التشغيل

1. حساب على [Supabase](https://supabase.com)
2. متصفح ويب حديث
3. خادم ويب محلي (مثل Live Server في VS Code)

## 🗄️ إعداد قاعدة البيانات

### 1. إنشاء مشروع Supabase

1. اذهب إلى [supabase.com](https://supabase.com)
2. أنشئ مشروعًا جديدًا
3. احفظ URL و ANON KEY

### 2. إنشاء الجداول

قم بتنفيذ الأوامر التالية في SQL Editor في Supabase:

```sql
-- جدول المستخدمين
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- جدول الدعوات للعب
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | accepted | declined
  created_at TIMESTAMP DEFAULT NOW()
);

-- جدول الحركات داخل اللعبة (Realtime)
CREATE TABLE moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL,
  player TEXT NOT NULL,
  position INTEGER NOT NULL, -- من 0 إلى 8 (مربعات XO)
  symbol TEXT NOT NULL, -- X أو O
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. إعداد السياسات (Policies)

```sql
-- السماح بإدخال مستخدمين جدد
CREATE POLICY "Allow insert for all" ON users
  FOR INSERT TO anon
  USING (true);

-- السماح بقراءة بيانات المستخدمين
CREATE POLICY "Allow select for all" ON users
  FOR SELECT TO anon
  USING (true);

-- السماح بتحديث بيانات المستخدمين
CREATE POLICY "Allow update for users" ON users
  FOR UPDATE TO anon
  USING (true);

-- السماح بحذف المستخدمين لأنفسهم
CREATE POLICY "Allow delete for users" ON users
  FOR DELETE TO anon
  USING (true);

-- سياسات جدول الدعوات
CREATE POLICY "Allow insert invitations" ON invitations
  FOR INSERT TO anon
  USING (true);

CREATE POLICY "Allow select invitations" ON invitations
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow update invitations" ON invitations
  FOR UPDATE TO anon
  USING (true);

CREATE POLICY "Allow delete invitations" ON invitations
  FOR DELETE TO anon
  USING (true);

-- سياسات جدول الحركات
CREATE POLICY "Allow insert moves" ON moves
  FOR INSERT TO anon
  USING (true);

CREATE POLICY "Allow select moves" ON moves
  FOR SELECT TO anon
  USING (true);
```

### 4. تفعيل Realtime

1. اذهب إلى Database > Replication
2. فعّل Realtime لجميع الجداول (users, invitations, moves)

## ⚙️ إعداد المشروع

### 1. تحديث إعدادات Supabase

افتح ملف `supabase.js` وحدث المتغيرات:

```javascript
const SUPABASE_URL = "ضع_URL_مشروعك_هنا";
const SUPABASE_ANON_KEY = "ضع_ANON_KEY_هنا";
```

### 2. تشغيل المشروع

1. افتح المشروع في VS Code
2. ثبت إضافة Live Server
3. انقر بزر الماوس الأيمن على `index.html`
4. اختر "Open with Live Server"

## 🎮 كيفية اللعب

1. **إنشاء حساب**: أدخل اسم مستخدم وكلمة مرور
2. **تسجيل الدخول**: استخدم بياناتك المسجلة
3. **دعوة صديق**: أدخل اسم المستخدم وأرسل دعوة
4. **قبول الدعوة**: عندما يتلقى صديقك الدعوة، سيظهر له تأكيد
5. **اللعب**: ابدأ اللعب! الحركات ستتزامن فورياً

## 📱 الملفات

```
/game-xo/
├── index.html        # صفحة تسجيل الدخول
├── game.html         # صفحة اللعبة
├── profile.html      # صفحة البروفايل
├── styles.css        # التنسيقات
├── app.js            # منطق تسجيل الدخول
├── game.js           # منطق اللعبة
├── profile.js        # منطق البروفايل
├── supabase.js       # إعدادات Supabase
└── README.md         # هذا الملف
```

## 🔧 استكشاف الأخطاء

### مشاكل شائعة:

1. **خطأ في الاتصال**: تأكد من صحة URL و ANON KEY
2. **لا يمكن إنشاء حساب**: تأكد من وجود جدول `users` والسياسات
3. **لا تعمل المزامنة**: تأكد من تفعيل Realtime
4. **خطأ في الدعوات**: تأكد من وجود جدول `invitations`

### رسائل الخطأ:

- `"اسم المستخدم موجود"`: جرب اسم مستخدم آخر
- `"خطأ في تسجيل الدخول"`: تأكد من صحة البيانات
- `"خطأ في الاتصال"`: تحقق من إعدادات Supabase

## 🚀 التطوير المستقبلي

- [ ] إضافة المزيد من الألعاب
- [ ] نظام رتبة اللاعبين
- [ ] غرف اللعب المتعددة
- [ ] إشعارات فورية
- [ ] تاريخ المباريات

## 📄 الترخيص

هذا المشروع مفتوح المصدر ومتاح للاستخدام الشخصي والتعليمي.

---

**تم التطوير بـ ❤️ باستخدام Supabase** 