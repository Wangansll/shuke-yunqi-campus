// utils/kb.js —— 知识库统一出口
// 分六条线维护：学院线（官网事实）、校园生活线（公众号/图书馆攻略）、
// 学习与教务线（教务系统 / 智圩平台 / 教学改革）、学校文件线（下发的通知办法流程）、
// 吉利线（集团概况 / 校企协同 / 招聘入口）、东盟线（公开国情与跨境实务）。
// 以后要加"就业线""社团线"，只要新建 kb-xxx.js 再 concat 进来，检索层不用改。
const school = require('./kb-school')
const campus = require('./kb-campus')
const learn = require('./kb-learn')
const docs = require('./kb-docs')
const official = require('./kb-official')
const geely = require('./kb-geely')
const asean = require('./kb-asean')

const KB = school.concat(campus, learn, docs, official, geely, asean)

module.exports = {
  KB,
  KB_SIZE: KB.length,
  // 展示用：校内 = 学院线 + 校园生活线 + 学习与教务线 + 学校文件线 + 官网概况线
  KB_SCHOOL_SIZE: school.length + campus.length + learn.length + docs.length + official.length,
  // 吉利单独计，提问时按方位加权
  KB_GEELY_SIZE: geely.length,
  KB_ASEAN_SIZE: asean.length,
  KB_CAMPUS_SIZE: campus.length,
  KB_LEARN_SIZE: learn.length,
  KB_DOCS_SIZE: docs.length,
  KB_OFFICIAL_SIZE: official.length,
}
