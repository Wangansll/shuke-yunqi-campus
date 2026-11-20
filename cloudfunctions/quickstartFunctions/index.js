const cloud = require("wx-server-sdk");
const https = require("https");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 快递轨迹查询：走快递100 网页端接口（无 key，但要求 Referer，所以必须在服务端发）
// 注意：这是网页私有接口，非官方文档，可能限流或变更；查不到时前端会给菜鸟裹裹的入口。
const httpGetJsonOnce = (path) =>
  new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "www.kuaidi100.com",
        path,
        method: "GET",
        headers: {
          Referer: "https://www.kuaidi100.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "zh-CN,zh;q=0.9",
          // 缺这个头会被判「非法请求」(returnCode 301)，实测必须带
          "X-Requested-With": "XMLHttpRequest",
        },
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (d) => {
          buf += d;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(7000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });

// 快递100 对同一来源有频率限制，连续请求可能直接返回空，重试一次能救回来
const httpGetJson = async (path) => {
  for (let i = 0; i < 2; i++) {
    const r = await httpGetJsonOnce(path);
    if (r) return r;
    await new Promise((s) => setTimeout(s, 700));
  }
  return null;
};

const getExpress = async (event) => {
  const no = String(event.no || "").replace(/[\s-]/g, "");
  if (no.length < 6) return { ok: false, msg: "单号太短，检查一下" };
  let com = String(event.com || "").trim();
  if (!com) {
    const auto = await httpGetJson(
      "/autonumber/autoComNum?resultv2=1&text=" + encodeURIComponent(no)
    );
    // 实测返回形如 { comCode, num, auto:[{comCode,name}], autoDest:[...] }
    const list =
      (auto && (auto.auto || (auto.autoComNum && auto.autoComNum.auto))) || [];
    if (!list.length) {
      return { ok: false, msg: "没识别出是哪家快递，选一下快递公司再查" };
    }
    com = list[0].comCode;
  }
  const q = await httpGetJson(
    "/query?type=" +
      encodeURIComponent(com) +
      "&postid=" +
      encodeURIComponent(no) +
      "&temp=" +
      Date.now()
  );
  if (!q) return { ok: false, msg: "查询服务没响应，稍后再试" };
  if (String(q.status) !== "200") {
    return { ok: false, com, msg: q.message || "查不到这条单号，可能还没揽收" };
  }
  const rows = q.data || [];
  // 快递100 对空结果会给一条「查无结果」，别把它当轨迹展示给用户
  if (rows.length === 1 && /查无结果|暂无/.test(rows[0].context || "")) {
    return { ok: false, com, msg: "这单号暂时查不到轨迹，可能还没揽收" };
  }
  return {
    ok: true,
    com,
    list: rows.slice(0, 40).map((x) => ({
      time: x.ftime || x.time || "",
      context: x.context || "",
      status: x.status || "",
    })),
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  // 获取小程序二维码的buffer
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  // 将图片上传云存储空间
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合
const createCollection = async () => {
  try {
    // 创建集合
    await db.createCollection("sales");
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "上海",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "南京",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "广州",
        sales: 22,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "深圳",
        sales: 22,
      },
    });
    return {
      success: true,
    };
  } catch (e) {
    // 这里catch到的是该collection已经存在，从业务逻辑上来说是运行成功的，所以catch返回success给前端，避免工具在前端抛出异常
    return {
      success: true,
      data: "create collection success",
    };
  }
};

// 查询数据
const selectRecord = async () => {
  // 返回数据库查询结果
  return await db.collection("sales").get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    // 遍历修改数据库信息
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({
          _id: event.data[i]._id,
        })
        .update({
          data: {
            sales: event.data[i].sales,
          },
        });
    }
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    // 插入数据
    await db.collection("sales").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db
      .collection("sales")
      .where({
        _id: event.data._id,
      })
      .remove();
    return {
      success: true,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 云函数入口函数
exports.main = async (event, context) => {
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    case "getExpress":
      return await getExpress(event);
    case "getMiniProgramCode":
      return await getMiniProgramCode();
    case "createCollection":
      return await createCollection();
    case "selectRecord":
      return await selectRecord();
    case "updateRecord":
      return await updateRecord(event);
    case "insertRecord":
      return await insertRecord(event);
    case "deleteRecord":
      return await deleteRecord(event);
  }
};
