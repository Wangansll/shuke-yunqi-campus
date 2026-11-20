// 校外外卖店铺数据：2026-11-18 从美团外卖抓取的一次性快照
// 位置锚点：广西民族大学相思湖学院（南宁市友谊路55号）
// 评分/月售/距离/起送/配送费均为美团接口原值，未改写；无数据处留空，不补默认值
const SOURCE = { t: '美团外卖 · 校园周边', d: '2026-11-18 抓取', anchor: '友谊路55号（相思湖学院）' }

const SHOPS = [
 {
  "id": "IsFY84CeaHaxaEl_teFXfwI",
  "name": "老北京脆皮手撕烤鸭（烤鸭饭）",
  "img": "/images/shops/s01.jpg",
  "score": "4.9",
  "sales": "月售3000+",
  "dist": "1.3km",
  "minPrice": "起送 ¥15",
  "shipFee": "配送 约¥1",
  "eta": "55分钟",
  "avg": "人均 ¥17",
  "kind": "烧烤烤物",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=IsFY84CeaHaxaEl_teFXfwI"
 },
 {
  "id": "Faz4uDAiFTuqwKEV2Wm9xAI",
  "name": "美石记石锅饭（数科店）",
  "img": "/images/shops/s02.jpg",
  "score": "4.9",
  "sales": "月售300+",
  "dist": "1.4km",
  "minPrice": "起送 ¥10",
  "shipFee": "配送 约¥2.5",
  "eta": "65分钟",
  "avg": "人均 ¥16",
  "kind": "饭类快餐",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=Faz4uDAiFTuqwKEV2Wm9xAI"
 },
 {
  "id": "aVLMVsbbI9_Fbm9r0lxRTwI",
  "name": "疆小丫新疆炒米粉（数科店）",
  "img": "/images/shops/s03.jpg",
  "score": "4.4",
  "sales": "月售400+",
  "dist": "1.4km",
  "minPrice": "起送 ¥10",
  "shipFee": "配送 约¥2",
  "eta": "55分钟",
  "avg": "人均 ¥15",
  "kind": "米粉米线",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=aVLMVsbbI9_Fbm9r0lxRTwI"
 },
 {
  "id": "UQ9AwkjFtBoGy9C8AidiSwI",
  "name": "云南小锅米线",
  "img": "/images/shops/s04.jpg",
  "score": "5.0",
  "sales": "月售400+",
  "dist": "1.3km",
  "minPrice": "起送 ¥10",
  "shipFee": "配送 约¥0.5",
  "eta": "65分钟",
  "avg": "人均 ¥15",
  "kind": "米粉米线",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=UQ9AwkjFtBoGy9C8AidiSwI"
 },
 {
  "id": "MV1B81_euHOLi703HWPOSgI",
  "name": "小食堂(数科店)",
  "img": "/images/shops/s05.jpg",
  "score": "4.9",
  "sales": "月售100+",
  "dist": "1.4km",
  "minPrice": "起送 ¥18",
  "shipFee": "配送 约¥1.5",
  "eta": "65分钟",
  "avg": "人均 ¥15",
  "kind": "其他",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=MV1B81_euHOLi703HWPOSgI"
 },
 {
  "id": "uxWWcd0ZJRu57C8gBSWZZQI",
  "name": "唛哆哆美食馆",
  "img": "/images/shops/s06.jpg",
  "score": "",
  "sales": "月售300+",
  "dist": "1.3km",
  "minPrice": "起送 ¥8",
  "shipFee": "配送 约¥1.9",
  "eta": "95分钟",
  "avg": "人均 ¥13",
  "kind": "饭类快餐",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=uxWWcd0ZJRu57C8gBSWZZQI"
 },
 {
  "id": "YHQyabXuzpwXGqbt-9yzowI",
  "name": "意式风味牛排饭",
  "img": "/images/shops/s07.jpg",
  "score": "4.7",
  "sales": "月售5000+",
  "dist": "1.2km",
  "minPrice": "起送 ¥15",
  "shipFee": "配送 约¥0",
  "eta": "65分钟",
  "avg": "人均 ¥11",
  "kind": "西餐简餐",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=YHQyabXuzpwXGqbt-9yzowI"
 },
 {
  "id": "6i3W0Yzt1EZku9qspV9aegI",
  "name": "张姐果酱烧烤店（数科店）",
  "img": "/images/shops/s08.jpg",
  "score": "4.8",
  "sales": "月售300+",
  "dist": "1.4km",
  "minPrice": "起送 ¥10",
  "shipFee": "配送 约¥2.5",
  "eta": "50分钟",
  "avg": "人均 ¥19",
  "kind": "烧烤烤物",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=6i3W0Yzt1EZku9qspV9aegI"
 },
 {
  "id": "yXpdGqq2Q_cIA1oJLt1ffQI",
  "name": "阿波香辣桂味",
  "img": "/images/shops/s09.jpg",
  "score": "4.2",
  "sales": "月售300+",
  "dist": "1.3km",
  "minPrice": "起送 ¥15",
  "shipFee": "配送 约¥0.5",
  "eta": "55分钟",
  "avg": "人均 ¥16",
  "kind": "其他",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=yXpdGqq2Q_cIA1oJLt1ffQI"
 },
 {
  "id": "F4uTUM19EmUGupACzIOFiAI",
  "name": "F+牛肉饭（一食堂店）",
  "img": "/images/shops/s10.jpg",
  "score": "4.9",
  "sales": "月售400+",
  "dist": "803m",
  "minPrice": "起送 ¥5",
  "shipFee": "配送 约¥1",
  "eta": "68分钟",
  "avg": "人均 ¥14",
  "kind": "饭类快餐",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=F4uTUM19EmUGupACzIOFiAI"
 },
 {
  "id": "E3BPsI4D2g-S9n4-SQEKDAI",
  "name": "小鸡啄米黄焖鸡米饭（数科店）",
  "img": "/images/shops/s11.jpg",
  "score": "4.5",
  "sales": "月售300+",
  "dist": "1.4km",
  "minPrice": "起送 ¥10",
  "shipFee": "配送 约¥2.5",
  "eta": "45分钟",
  "avg": "人均 ¥16",
  "kind": "饭类快餐",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=E3BPsI4D2g-S9n4-SQEKDAI"
 },
 {
  "id": "WHq5Sn8kRycQtn2n2hgqrAI",
  "name": "无骨烤鱼饭·凉皮肉夹馍",
  "img": "/images/shops/s12.jpg",
  "score": "4.3",
  "sales": "月售200+",
  "dist": "1.3km",
  "minPrice": "起送 ¥10",
  "shipFee": "配送 约¥1",
  "eta": "43分钟",
  "avg": "人均 ¥15",
  "kind": "烧烤烤物",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=WHq5Sn8kRycQtn2n2hgqrAI"
 },
 {
  "id": "7tFTk550qW3PbTtF-dcWtwI",
  "name": "名厨自选快餐（二食堂）",
  "img": "/images/shops/s13.jpg",
  "score": "4.7",
  "sales": "月售100+",
  "dist": "183m",
  "minPrice": "起送 ¥5",
  "shipFee": "配送 约¥0.8",
  "eta": "58分钟",
  "avg": "人均 ¥12",
  "kind": "饭类快餐",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=7tFTk550qW3PbTtF-dcWtwI"
 },
 {
  "id": "W43AKW-W_OVdXGY1q7x0jQI",
  "name": "桂小味.烤盘饭.拌米粉",
  "img": "/images/shops/s14.jpg",
  "score": "4.4",
  "sales": "月售700+",
  "dist": "1.4km",
  "minPrice": "起送 ¥10",
  "shipFee": "配送 约¥1.5",
  "eta": "65分钟",
  "avg": "人均 ¥13",
  "kind": "米粉米线",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=W43AKW-W_OVdXGY1q7x0jQI"
 },
 {
  "id": "9YkiDIf7ao0CEZS2ZlJ38wI",
  "name": "有一家烤肉拌饭",
  "img": "/images/shops/s15.jpg",
  "score": "4.7",
  "sales": "月售600+",
  "dist": "1.3km",
  "minPrice": "起送 ¥15",
  "shipFee": "配送 约¥0",
  "eta": "44分钟",
  "avg": "人均 ¥17",
  "kind": "饭类快餐",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=9YkiDIf7ao0CEZS2ZlJ38wI"
 },
 {
  "id": "cWs-Ris2PUxEH3jAmPTy6QI",
  "name": "杨国福麻辣烫（一食堂店）",
  "img": "/images/shops/s16.jpg",
  "score": "4.7",
  "sales": "月售300+",
  "dist": "766m",
  "minPrice": "起送 ¥17",
  "shipFee": "配送 约¥1",
  "eta": "58分钟",
  "avg": "人均 ¥18",
  "kind": "麻辣烫",
  "scheme": "https://h5.waimai.meituan.com/waimai/mindex/menu?mtShopId=-100&poi_id_str=cWs-Ris2PUxEH3jAmPTy6QI"
 }
]

const KINDS = ['米粉米线', '饭类快餐', '烧烤烤物', '麻辣烫', '西餐简餐', '其他']
const GROUPS = KINDS
  .map((k) => ({ k, n: SHOPS.filter((s) => s.kind === k).length, items: SHOPS.filter((s) => s.kind === k) }))
  .filter((g) => g.n > 0)

module.exports = { SOURCE, SHOPS, GROUPS, KINDS }
