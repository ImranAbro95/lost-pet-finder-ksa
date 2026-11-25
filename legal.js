// Privacy notice and terms (Arabic + English), written for the Saudi Personal Data Protection Law (PDPL).
// Change NOTICE_VERSION whenever the meaning changes: signed-in users are then asked to accept again.
export const NOTICE_VERSION = "2026-11-25";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function privacyHtml(lang, cfg) {
  const op = esc(cfg.operatorName || (lang === "ar" ? "[اسم المشغّل]" : "[operator name]"));
  const mail = esc(cfg.contactEmail || (lang === "ar" ? "[البريد الإلكتروني للتواصل]" : "[contact email]"));
  const region = esc(cfg.dataRegion || (lang === "ar" ? "[منطقة الخوادم]" : "[server region]"));
  if (lang === "ar") return `
  <p class="muted">الإصدار ${NOTICE_VERSION}. نكتب هذه السياسة بلغة بسيطة وفق نظام حماية البيانات الشخصية في المملكة العربية السعودية.</p>
  <h2>من نحن</h2><p>يشغّل ${op} خدمة «مفقودات الحيوانات الأليفة»، وهي خدمة مجانية لمساعدة الناس على إيجاد حيواناتهم المفقودة. للتواصل بخصوص بياناتك: <bdi>${mail}</bdi>.</p>
  <h2>ما البيانات التي نجمعها ولماذا</h2>
  <table class="legal"><tr><th>البيانات</th><th>الغرض</th><th>إلزامية؟</th></tr>
  <tr><td>بريدك ومعرّف حسابك في Google</td><td>تسجيل الدخول وحماية المنشورات من إساءة الاستخدام</td><td>نعم، للنشر والمراسلة فقط</td></tr>
  <tr><td>منشوراتك: صور الحيوان والوصف والحي والتاريخ ودبوس الخريطة الاختياري</td><td>عرضها للعامة ومطابقة الحيوانات المفقودة والمعثور عليها</td><td>الصورة واللون والتاريخ نعم، والباقي اختياري</td></tr>
  <tr><td>رقم واتساب</td><td>يظهر على منشورك فقط إذا أضفته</td><td>اختياري</td></tr>
  <tr><td>الرسائل الخاصة</td><td>تمكين التواصل بين الطرفين</td><td>اختيارية</td></tr>
  <tr><td>«بصمات» الصور</td><td>أرقام يصنعها الذكاء الاصطناعي على جهازك من صور الحيوان لمطابقة الصور</td><td>تُصنع تلقائياً من صور الحيوان</td></tr>
  <tr><td>سجل الموافقات وطلبات الخصوصية</td><td>إثبات موافقتك وتنفيذ طلباتك</td><td>نعم</td></tr></table>
  <p>لا نستخدم ملفات تعريف للإعلانات أو التتبع، ولا نبيع بياناتك. نحفظ جلسة الدخول في متصفحك فقط.</p>
  <h2>الأساس النظامي</h2><p>نعالج بياناتك بناءً على موافقتك: عند إنشاء الحساب، وعند نشر كل منشور، وبموافقة منفصلة لإظهار رقم واتساب. يمكنك سحب موافقتك في أي وقت من «حسابي».</p>
  <h2>من يرى البيانات أو يعالجها</h2>
  <ul><li><b>العامة:</b> محتوى منشوراتك فقط (بدون بريدك).</li>
  <li><b>مقدمو الخدمة نيابة عنا:</b> Supabase (قاعدة البيانات وتخزين الصور)، Google (تسجيل الدخول)، Cloudflare (استضافة الموقع وإحصاءات الزيارات بدون ملفات تعريف الارتباط: تُحسب الزيارات بشكل إجمالي دون التعرف عليك). وعند استخدام الخريطة أو الذكاء الاصطناعي يحمّل متصفحك صور الخرائط من OpenStreetMap ونموذج الذكاء الاصطناعي من Hugging Face وjsDelivr دون إرسال بياناتك الشخصية. وإذا بحثت عن عنوان، يرسل متصفحك الكلمات التي كتبتها أو نقطة الخريطة إلى خدمة Nominatim التابعة لـ OpenStreetMap لإيجاد المكان، دون اسمك أو بريدك. ولا يُستخدم موقع جهازك إلا إذا ضغطت «استخدم موقعي» ووافقت في المتصفح، ويُستخدم فقط لوضع الدبوس الذي يمكنك تحريكه أو إزالته قبل النشر.</li>
  <li><b>المشرفون:</b> يطّلعون على المنشورات والرسائل المبلّغ عنها فقط للتحقق من البلاغ.</li></ul>
  <h2>النقل خارج المملكة</h2><p>تُحفظ البيانات على خوادم Supabase في ${region}، أي خارج المملكة. ننقل فقط الحد الأدنى اللازم لتقديم الخدمة لك، ونعتمد الضمانات التي تتطلبها لائحة نقل البيانات الشخصية خارج المملكة.</p>
  <h2>مدة الاحتفاظ</h2><ul><li>تُغلق المنشورات المفتوحة تلقائياً بعد 120 يوماً.</li><li>تُحذف المنشورات المغلقة أو التي عاد أصحابها، والرسائل والبلاغات، بعد 365 يوماً.</li><li>يمكنك حذف أي منشور أو حسابك كاملاً في أي وقت.</li><li>يُحتفظ بسجل إجراءات الخصوصية 5 سنوات دون بيانات أخرى، لإثبات الالتزام.</li></ul>
  <h2>حقوقك</h2><ul><li>أن تُبلَّغ بكيفية استخدام بياناتك (هذه الصفحة).</li><li>الاطلاع والحصول على نسخة: «تنزيل بياناتي» في صفحة «حسابي».</li><li>التصحيح: عدّل منشوراتك في أي وقت.</li><li>الإتلاف: احذف منشوراتك أو حسابك.</li><li>سحب الموافقة في أي وقت.</li></ul>
  <p>يمكنك أيضاً مراسلتنا على <bdi>${mail}</bdi>، ونرد خلال 30 يوماً. ويحق لك تقديم شكوى إلى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا).</p>
  <h2>الأمان والتسريبات</h2><p>نستخدم اتصالات مشفّرة وقواعد صلاحيات في قاعدة البيانات وصلاحيات إشراف محدودة. إذا حدث تسريب قد يضر بك فسنبلغ سدايا خلال 72 ساعة من علمنا به ونبلغك دون تأخير.</p>
  <h2>العمر</h2><p>الخدمة لمن هم في عمر 18 سنة فأكثر. إذا كان عمرك أقل من 18 فاطلب من أحد والديك النشر عنك.</p>
  <h2>نصيحة للصور</h2><p>صوّر الحيوان فقط. تجنب ظهور وجوه الناس وأرقام المنازل ولوحات السيارات.</p>
  <h2>التغييرات</h2><p>إذا غيّرنا هذه السياسة تغييراً مهماً فسنعرض الإصدار الجديد ونطلب موافقتك مرة أخرى.</p>`;
  return `
  <p class="muted">Version ${NOTICE_VERSION}. Written in plain language under Saudi Arabia's Personal Data Protection Law (PDPL).</p>
  <h2>Who we are</h2><p>Lost Pet Finder KSA is a free service run by ${op} to help people find lost pets. For anything about your data: <bdi>${mail}</bdi>.</p>
  <h2>What we collect and why</h2>
  <table class="legal"><tr><th>Data</th><th>Why</th><th>Required?</th></tr>
  <tr><td>Your Google email and account ID</td><td>To sign you in and protect posts from misuse</td><td>Only to post or send messages</td></tr>
  <tr><td>Your posts: pet photos, description, area, date, optional map pin</td><td>To show them publicly and match lost and found pets</td><td>Photo, colour and date yes; the rest optional</td></tr>
  <tr><td>WhatsApp number</td><td>Shown on your post only if you add it</td><td>Optional</td></tr>
  <tr><td>Private messages</td><td>So people can contact each other</td><td>Optional</td></tr>
  <tr><td>Photo "fingerprints"</td><td>Numbers that AI makes on your device from the pet photos, used to match photos</td><td>Made automatically from pet photos</td></tr>
  <tr><td>Consent records and privacy requests</td><td>To prove your consent and carry out your requests</td><td>Yes</td></tr></table>
  <p>We use no advertising or tracking cookies and never sell your data. Your sign-in session is kept only in your browser.</p>
  <h2>Legal basis</h2><p>We process your data with your consent: when you create your account, each time you publish a post, and separately if you choose to show a WhatsApp number. You can withdraw consent at any time in My account.</p>
  <h2>Who sees or handles it</h2>
  <ul><li><b>The public:</b> only the content of your posts (never your email).</li>
  <li><b>Service providers working for us:</b> Supabase (database and photo storage), Google (sign-in), Cloudflare (website hosting, and visit statistics without cookies: visits are counted in total, without identifying you). When you use the map or AI photo search, your browser downloads map images from OpenStreetMap and the AI model from Hugging Face and jsDelivr; no personal data is sent to them. If you search for an address, your browser sends the words you typed, or the map point, to OpenStreetMap's Nominatim service to find the place, without your name or email. Your device location is used only if you press "Use my location" and allow it in your browser, and only to place the pin, which you can move or remove before publishing.</li>
  <li><b>Moderators:</b> see reported posts and messages only to check a report.</li></ul>
  <h2>Transfers outside Saudi Arabia</h2><p>Data is stored on Supabase servers in ${region}, which is outside the Kingdom. We transfer only the minimum needed to provide the service to you, with the safeguards required by the Saudi regulation on transferring personal data outside the Kingdom.</p>
  <h2>How long we keep it</h2><ul><li>Open posts close automatically after 120 days.</li><li>Closed or reunited posts, messages and reports are deleted after 365 days.</li><li>You can delete any post, or your whole account, at any time.</li><li>A log of privacy actions is kept for 5 years, with no other data, to prove compliance.</li></ul>
  <h2>Your rights</h2><ul><li>To be told how your data is used (this page).</li><li>To see your data and get a copy: "Download my data" in My account.</li><li>To correct it: edit your posts at any time.</li><li>To have it destroyed: delete your posts or your account.</li><li>To withdraw consent at any time.</li></ul>
  <p>You can also email <bdi>${mail}</bdi>; we reply within 30 days. You may also complain to the Saudi Data and AI Authority (SDAIA).</p>
  <h2>Security and breaches</h2><p>We use encrypted connections, access rules in the database and limited moderator access. If a breach could harm you, we will notify SDAIA within 72 hours of becoming aware of it, and tell you without undue delay.</p>
  <h2>Age</h2><p>The service is for people aged 18 and over. If you are under 18, please ask a parent to post for you.</p>
  <h2>Photo tip</h2><p>Photograph only the pet. Avoid people's faces, house numbers and car plates.</p>
  <h2>Changes</h2><p>If we change this notice in an important way, we will show the new version and ask for your consent again.</p>`;
}

export function termsHtml(lang) {
  if (lang === "ar") return `
  <p class="muted">الإصدار ${NOTICE_VERSION}</p>
  <ul><li>الخدمة مجانية ومقدمة كما هي، ولا نضمن العثور على أي حيوان.</li>
  <li>انشر فقط عن حيوانات مفقودة أو معثور عليها فعلاً، وبمعلومات صحيحة.</li>
  <li>يُمنع: بيع الحيوانات، الإعلانات، طلب المال مقابل إعادة حيوان، الاحتيال، المحتوى المسيء، ونشر بيانات أشخاص آخرين.</li>
  <li>يجوز لنا إخفاء أي منشور أو إيقاف أي حساب يخالف هذه الشروط.</li>
  <li>قابل الطرف الآخر في مكان عام، ولا تدفع أي مبلغ قبل رؤية الحيوان. نحن لسنا طرفاً في أي اتفاق بين المستخدمين.</li>
  <li>تخضع هذه الشروط لأنظمة المملكة العربية السعودية.</li></ul>`;
  return `
  <p class="muted">Version ${NOTICE_VERSION}</p>
  <ul><li>The service is free and provided as it is; we cannot promise any pet will be found.</li>
  <li>Post only about pets that are really lost or found, with true information.</li>
  <li>Not allowed: selling animals, adverts, asking for money to return a pet, scams, offensive content, and posting other people's personal details.</li>
  <li>We may hide any post or block any account that breaks these terms.</li>
  <li>Meet in a public place and never pay before you see the pet. We are not a party to any arrangement between users.</li>
  <li>These terms are governed by the laws of Saudi Arabia.</li></ul>`;
}
