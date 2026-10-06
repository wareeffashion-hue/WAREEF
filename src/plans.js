// Plan catalog. Prices are in SAR and include VAT; edit freely.
// Limits: stores (workspaces), team members, tracked events per month.
export const PLANS = {
  trial: { name: 'تجربة مجانية', price: { monthly: 0, yearly: 0 }, stores: 3, members: 3, events: 300_000, public: false },
  starter: { name: 'البداية', price: { monthly: 199, yearly: 1990 }, stores: 1, members: 2, events: 150_000, public: true,
    features: ['متجر واحد', 'عضوين في الفريق', '150 ألف حدث شهرياً', 'كل نماذج الإسناد والتقارير', 'ربط سلة والمنصات الإعلانية'] },
  growth: { name: 'النمو', price: { monthly: 499, yearly: 4990 }, stores: 5, members: 5, events: 1_000_000, public: true, popular: true,
    features: ['حتى 5 متاجر', '5 أعضاء', 'مليون حدث شهرياً', 'المزيج التسويقي (MMM)', 'دخول للعملاء بصلاحيات محدودة'] },
  agency: { name: 'الوكالات', price: { monthly: 1299, yearly: 12990 }, stores: 25, members: 20, events: 5_000_000, public: true,
    features: ['حتى 25 متجر', '20 عضو', '5 ملايين حدث شهرياً', 'لوحة الوكالة لكل العملاء', 'أولوية في الدعم'] },
};

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
// After a subscription lapses, tracking keeps recording this long so no data is lost.
export const GRACE_DAYS = 7;
// Page views past the monthly quota are still kept up to this overage.
export const OVERAGE = 0.1;

export function publicPlans() {
  return Object.entries(PLANS).filter(([, p]) => p.public).map(([id, p]) => ({ id, ...p }));
}
