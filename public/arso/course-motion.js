// مشاهد دروس الفيديو المتحركة، وملخصات المراجعة، والمسارات التعليمية.
// أنواع المشاهد: title (عنوان كبير)، list (نقاط تظهر تباعاً)، flow (خطوات بأسهم)، compare (قبل/بعد)، stat (رقم كبير).
window.ARSO_MOTION = {
  method: [
    ['شاهد', 'درس متحرك قصير يرسم الفكرة قبل التفاصيل.'],
    ['اقرأ', 'الشرح المكتوب بالأمثلة والجداول.'],
    ['طبّق', 'تمرين عملي على مشروعك الحقيقي.'],
    ['اختبر', 'أسئلة سريعة تثبّت ما تعلمته.'],
    ['راجع', 'ملخص الوحدة السابقة يظهر في بداية كل وحدة.'],
  ],
  paths: [
    { id: 'business', title: 'مسار صاحب المتجر والمسوّق', en: 'BUSINESS TRACK', hours: 9, desc: 'للكتابة والتسويق وخدمة العملاء وتحليل البيانات، بلا برمجة.', units: ['meet-claude', 'prompt-basics', 'advanced-techniques', 'long-documents', 'productivity-tools', 'project'] },
    { id: 'developer', title: 'مسار المطوّر', en: 'DEVELOPER TRACK', hours: 11, desc: 'لبناء الأتمتة والوكلاء ودمج Claude في الأنظمة.', units: ['meet-claude', 'prompt-basics', 'advanced-techniques', 'claude-code', 'agents-evals', 'claude-api', 'project'] },
    { id: 'quick', title: 'المسار السريع', en: 'QUICK START', hours: 5, desc: 'أهم الأساسيات في جلسة واحدة لمن يريد نتيجة اليوم.', units: ['meet-claude', 'prompt-basics', 'productivity-tools'] },
    { id: 'full', title: 'المسار الكامل', en: 'COMPLETE TRACK', hours: 16, desc: 'كل الوحدات بالترتيب من البداية إلى الاحتراف.', units: ['meet-claude', 'prompt-basics', 'advanced-techniques', 'long-documents', 'productivity-tools', 'claude-code', 'agents-evals', 'claude-api', 'project'] },
  ],
  units: {
    'meet-claude': {
      recap: ['اختر النموذج قبل أن تعدّل البرومبت.', 'Opus 5.5 نقطة البداية، و Haiku للمهام السريعة الكثيرة.', 'Claude موظف ذكي جديد: كل ما لا تقوله سيخمّنه.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 01', title: 'تعرّف على Claude', caption: 'قبل أي برومبت، اختر الأداة المناسبة.' },
        { type: 'list', title: 'أربعة نماذج، أربع مهمات', items: ['Fable 5.1 — التفكير الصعب', 'Opus 5.5 — البداية الموصى بها', 'Sonnet 5.5 — السرعة مع الذكاء', 'Haiku 5.5 — الكمية والسرعة'], caption: 'كل نموذج يوازن بين العمق والسرعة والتكلفة.' },
        { type: 'flow', title: 'ثلاث واجهات', items: ['claude.ai', 'Claude Code', 'Claude API'], caption: 'محادثة للجميع، وكيل للمبرمجين، ودمج للمطوّرين.' },
        { type: 'stat', value: '1M', label: 'توكن في نافذة السياق', caption: 'حوالي 555 ألف كلمة إنجليزية في طلب واحد.' },
        { type: 'title', kicker: 'العقلية', title: 'موظف ذكي.<br><em>لكنه جديد.</em>', caption: 'كل ما لا تقوله له، سيخمّنه.' },
      ],
    },
    'prompt-basics': {
      recap: ['اعرض البرومبت على زميل لا يعرف المهمة.', 'اشرح السبب، وقل ماذا تريد لا ما لا تريد.', 'الدور، السياق، المهمة، المدخلات، الشكل، القيود.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 02', title: 'أساسيات البرومبت', caption: 'القاعدة الذهبية: لو ارتبك زميلك، سيرتبك Claude.' },
        { type: 'compare', title: 'الفرق في سطر واحد', before: 'اكتب وصف لعباية', after: 'أنت كاتب محتوى لمتجر فاخر… الشكل: عنوان + فقرة + 4 مميزات', caption: 'الطلب الواضح يعطيك النتيجة من أول مرة.' },
        { type: 'flow', title: 'هيكل البرومبت', items: ['الدور', 'السياق', 'المهمة', 'المدخلات', 'الشكل', 'القيود'], caption: 'ستة عناصر تغطي كل ما يحتاجه Claude.' },
        { type: 'list', title: 'خمسة مبادئ', items: ['كن واضحاً ومباشراً', 'اشرح السبب', 'رتّب الخطوات', 'قل ماذا تريد', 'اطلب الفعل صراحة'], caption: 'كل مبدأ يقلّل التخمين.' },
        { type: 'title', kicker: 'السر', title: 'كرّر.<br><em>ثم احفظ.</em>', caption: 'عدّل بطلبات محددة، واحفظ البرومبت الممتاز في مكتبتك.' },
      ],
    },
    'advanced-techniques': {
      recap: ['افصل التعليمات والبيانات بوسوم XML.', '3–5 أمثلة متنوعة داخل وسوم example.', 'مسودة ← مراجعة ← تحسين، كل خطوة طلب منفصل.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 03', title: 'تقنيات متقدمة', caption: 'خمس تقنيات تفصل المحترف عن المبتدئ.' },
        { type: 'list', title: 'الوسوم ترتّب الفوضى', items: ['&lt;context&gt; الخلفية', '&lt;examples&gt; الأمثلة', '&lt;input&gt; البيانات', '&lt;instructions&gt; المطلوب'], caption: 'كل نوع محتوى في وسم خاص به.' },
        { type: 'stat', value: '3–5', label: 'أمثلة متنوعة', caption: 'أقوى طريقة للتحكم في الشكل والنبرة.' },
        { type: 'flow', title: 'التصحيح الذاتي', items: ['مسودة', 'مراجعة بمعايير', 'تحسين'], caption: 'كل خطوة طلب منفصل تستطيع فحصه.' },
        { type: 'compare', title: 'بدل الصراخ', before: 'مهم جداً: يجب دائماً…', after: 'استخدم هذه الأداة عندما…', caption: 'النماذج الحديثة تبالغ مع اللغة الحادة.' },
      ],
    },
    'long-documents': {
      recap: ['المستندات في الأعلى، والسؤال في النهاية.', 'اطلب الاقتباسات قبل التحليل.', 'مشروع لكل مجال، بقواعد مكتوبة مرة واحدة.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 04', title: 'المستندات والمشاريع', caption: 'مكان السؤال يغيّر النتيجة.' },
        { type: 'flow', title: 'ترتيب البرومبت الطويل', items: ['المستندات', 'التعليمات والأمثلة', 'السؤال'], caption: 'البيانات أولاً والسؤال أخيراً.' },
        { type: 'stat', value: '30%', label: 'تحسّن حتى في الجودة', caption: 'في اختبارات Anthropic مع المدخلات متعددة المستندات.' },
        { type: 'flow', title: 'اقتبس ثم حلّل', items: ['&lt;quotes&gt;', '&lt;analysis&gt;'], caption: 'الاقتباس يركّز Claude ويقلّل الاختلاق.' },
        { type: 'list', title: 'المشروع ذاكرة دائمة', items: ['دليل العلامة', 'قائمة المنتجات', 'السياسات', 'التعليمات الثابتة'], caption: 'اكتب قواعدك مرة واحدة بدل تكرارها.' },
      ],
    },
    'productivity-tools': {
      recap: ['اطلب الشكل بالاسم: صفحة، ملف Excel، عرض.', 'الموصّلات تبني الإجابة على بياناتك الحقيقية.', 'أي تعليمات تكررها ثلاث مرات تصبح مهارة.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 05', title: 'أدوات الإنتاجية', caption: 'Claude يبني ويبحث ويتصل بأدواتك.' },
        { type: 'list', title: 'خمس أدوات', items: ['Artifacts — صفحات وأدوات', 'Research — تقارير بمصادر', 'Connectors — بياناتك الحقيقية', 'Skills — تعليمات محفوظة', 'Files — Word و Excel و PDF'], caption: 'كل أداة تختصر عملاً يدوياً.' },
        { type: 'compare', title: 'اطلب الشكل بالاسم', before: 'سوّ لي جدول', after: 'أعطني ملف Excel بأعمدة…', caption: 'التحديد يوفّر جولات التعديل.' },
        { type: 'stat', value: '×3', label: 'تكرار = مهارة', caption: 'إذا كتبت التعليمات ثلاث مرات، احفظها مهارة.' },
        { type: 'title', kicker: 'الأمان', title: 'راجع.<br><em>ثم وافق.</em>', caption: 'اقرأ تفاصيل أي تعديل على متجرك قبل الموافقة.' },
      ],
    },
    'claude-code': {
      recap: ['أعطِ Claude فحصاً يعطي نجح/فشل.', 'استكشف ← خطّط ← نفّذ ← احفظ.', 'CLAUDE.md قصير، والـ Hooks لما يجب أن يحدث دائماً.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 06', title: 'Claude Code', caption: 'نافذة السياق هي أثمن مورد عندك.' },
        { type: 'flow', title: 'سير العمل', items: ['استكشف', 'خطّط', 'نفّذ', 'احفظ'], caption: 'Shift+Tab لوضع التخطيط قبل أي تعديل.' },
        { type: 'compare', title: 'أعطه طريقة يتحقق بها', before: 'حسّن شكل الصفحة', after: 'خذ لقطة، قارنها بالتصميم، وأصلح الفروقات', caption: 'الفحص يغلق الحلقة بدونك.' },
        { type: 'list', title: 'أدوات التوسعة', items: ['CLAUDE.md — قواعد دائمة', 'Skills — عند الحاجة', 'Subagents — سياق منفصل', 'Hooks — تنفيذ مضمون'], caption: 'لكل حاجة أداة.' },
        { type: 'stat', value: '2', label: 'تصحيحان ثم /clear', caption: 'جلسة نظيفة ببرومبت أفضل تتفوق على جلسة مزدحمة.' },
      ],
    },
    'agents-evals': {
      recap: ['قِس قبل أن تعدّل: حالات ضابطة وحدّية وحدود القدرة.', 'التعليمات لا تضيف قدرة، الأدوات تضيفها.', 'مولّد ← مقيّم ← مُصلِح.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 07', title: 'الوكلاء والتقييمات', caption: 'لا تعدّل برومبتاً لا تستطيع قياسه.' },
        { type: 'list', title: 'ثلاثة أنواع من الحالات', items: ['ضابطة — تنجح دائماً', 'حدّية — أخطاء سابقة', 'حدود القدرة — رفض أو تحويل'], caption: 'مجموعة اختبار تشغّلها بعد كل تعديل.' },
        { type: 'compare', title: 'القدرة لا تأتي بالكلام', before: 'احسب الفاتورة بدقة!', after: 'أعطه أداة حساب', caption: 'التعليمات لا تضيف قدرة، الأدوات تضيفها.' },
        { type: 'flow', title: 'ثلاثة أدوار', items: ['المولّد', 'المقيّم', 'المُصلِح'], caption: 'البرومبت الواحد يميل إلى تخطّي التحقق.' },
        { type: 'title', kicker: 'من The Prompting Playbook', title: 'قِس.<br><em>ثم حسّن.</em>', caption: 'تعديل واحد في كل مرة، ثم أعد التقييم.' },
      ],
    },
    'claude-api': {
      recap: ['جرّب في Console قبل كتابة الكود.', 'Structured Outputs بدل التعبئة المسبقة.', 'الكاش للثابت، و Batch للمهام غير العاجلة.'],
      scenes: [
        { type: 'title', kicker: 'الوحدة 08', title: 'Claude API', caption: 'Claude جزء من نظامك.' },
        { type: 'flow', title: 'من الفكرة إلى الإنتاج', items: ['Console', 'System prompt', 'Tools', 'Evals', 'إنتاج'], caption: 'جرّب، ثم ابنِ، ثم قِس.' },
        { type: 'stat', value: '50%', label: 'خصم Batch API', caption: 'للمهام غير العاجلة مثل أوصاف مئات المنتجات.' },
        { type: 'stat', value: '5%', label: 'سعر قراءة الكاش', caption: 'من سعر الدخل في Opus 5.5 و Sonnet 5.5.' },
        { type: 'list', title: 'أسرار التكلفة', items: ['النموذج المناسب', 'الثابت أولاً', 'Batch ليلاً', 'جهد أقل للبسيط'], caption: 'أربع عادات تخفض الفاتورة.' },
      ],
    },
    project: {
      scenes: [
        { type: 'title', kicker: 'المشروع الختامي', title: 'ابنِ.<br><em>قِس. حسّن.</em>', caption: 'مساعدة خدمة عملاء تجمع كل وحدات الدورة.' },
        { type: 'flow', title: 'ثلاث نسخ', items: ['النسخة 1', 'النسخة 2', 'النسخة 3'], caption: 'كل نسخة تُقاس بحالات الاختبار نفسها.' },
        { type: 'stat', value: '10', label: 'حالات اختبار', caption: 'أربع ضابطة، أربع حدّية، اثنتان للتحويل.' },
      ],
    },
  },
};
