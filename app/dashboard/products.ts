export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string | null;
  alt: string;
};

export const products: Product[] = [
  { id: 1, name: "كرسي استرخاء بوكل «نورا»", category: "أثاث", price: 899, image: "/products/boucle-chair.png", alt: "كرسي استرخاء بوكل بلون كريمي" },
  { id: 2, name: "طاولة جانبية خشب جوز «لينا»", category: "أثاث", price: 389, image: "/products/walnut-side-table.png", alt: "طاولة جانبية من خشب الجوز" },
  { id: 3, name: "طاولة قهوة بيضاوية «سمر»", category: "أثاث", price: 649, image: "/products/oval-coffee-table.png", alt: "طاولة قهوة خشبية بيضاوية" },
  { id: 4, name: "رف جداري خشبي «غصن»", category: "أثاث", price: 239, image: "/products/wall-shelf.png", alt: "رف جداري من الخشب الطبيعي" },
  { id: 5, name: "مصباح طاولة سيراميك «ضي»", category: "إضاءة", price: 289, image: "/products/ceramic-table-lamp.png", alt: "مصباح طاولة بقاعدة سيراميك وغطاء قماشي" },
  { id: 6, name: "مصباح أرضي قماشي «سنا»", category: "إضاءة", price: 549, image: "/products/floor-lamp.png", alt: "مصباح أرضي بغطاء قماشي فاتح" },
  { id: 7, name: "مصباح معلّق خيزران «وهج»", category: "إضاءة", price: 399, image: "/products/rattan-pendant.png", alt: "مصباح سقف معلّق من الخيزران المنسوج" },
  { id: 8, name: "فانوس زجاجي «ليل»", category: "إضاءة", price: 179, image: "/products/glass-lantern.png", alt: "فانوس زجاجي بإطار معدني نحاسي" },
  { id: 9, name: "وسادة كتان «رمل»", category: "منسوجات", price: 89, image: "/products/linen-cushion.png", alt: "وسادة كتان بلون رملي" },
  { id: 10, name: "بطانية قطنية «دفء»", category: "منسوجات", price: 199, image: "/products/cotton-throw.png", alt: "بطانية قطنية مطوية بلون عاجي" },
  { id: 11, name: "سجادة منسوجة «أثر»", category: "منسوجات", price: 499, image: "/products/woven-rug.png", alt: "سجادة منسوجة بلون بيج ونقوش هادئة" },
  { id: 12, name: "ستارة قطنية «نسيم»", category: "منسوجات", price: 249, image: "/products/cotton-curtain.png", alt: "ستارة قطنية فاتحة بجانب نافذة" },
  { id: 13, name: "مرآة دائرية «هالة»", category: "ديكور", price: 329, image: "/products/round-mirror.png", alt: "مرآة دائرية بإطار خشبي" },
  { id: 14, name: "مزهرية فخارية «طين»", category: "ديكور", price: 139, image: null, alt: "مزهرية فخارية بلون ترابي" },
  { id: 15, name: "لوحة جدارية «سكون»", category: "ديكور", price: 219, image: null, alt: "لوحة جدارية تجريدية بألوان محايدة" },
  { id: 16, name: "سلة خوص «دار»", category: "ديكور", price: 129, image: null, alt: "سلة تخزين من الخوص بمقابض" },
  { id: 17, name: "طقم ٤ أكواب سيراميك «صباح»", category: "أدوات المائدة", price: 149, image: null, alt: "أربعة أكواب سيراميك بلون عاجي" },
  { id: 18, name: "صينية تقديم خشبية «لمّة»", category: "أدوات المائدة", price: 169, image: null, alt: "صينية تقديم خشبية بمقابض" },
  { id: 19, name: "طقم ٤ أطباق «ندى»", category: "أدوات المائدة", price: 239, image: null, alt: "أربعة أطباق سيراميك بلون عاجي" },
  { id: 20, name: "إبريق زجاجي «صفا»", category: "أدوات المائدة", price: 119, image: null, alt: "إبريق ماء زجاجي شفاف" },
];
