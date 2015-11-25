login = require('./login');
mail = require('./mail');
sms = require('./sms');
Promise = require('bluebird');
AV = require('avoscloud-sdk');
setting = require('./setting');
AV.initialize(setting.leancloud.appid, setting.leancloud.appkey);
var Item = AV.Object.extend('Item');

var itemGetCache = {};
var itemGetTodayNewItemAmountCache = false;
setTimeout(function() {
    console.log('clear cache for todayAmount');
    itemGetTodayNewItemAmountCache = false;
}, 60000);

var item = {
    publish: function(params) {
        var item = new Item();
        params.randomStamp = Math.floor(Math.random() * 10000000000000000);
        params.pubTimeStamp = new Date().getTime();
        params.isVerified = false;
        return item.save(params);
    },
    collection: function(params) {
        var itemQuery = new AV.Query(Item);
        itemQuery.greaterThan("createdAt", new Date("2015-06-26 18:37:09"));
        if (params.category != 'all') {
            itemQuery.equalTo('category', params.category);
        }
        itemQuery.skip(params.start);
        itemQuery.limit(params.amount);
        itemQuery.notContainedIn("status", ["saled", "undercarriage"]);
        itemQuery.descending("pubTimeStamp");
        return itemQuery.find();
    },
    get: function(pubTimeStamp) {
        console.log(pubTimeStamp);
        //使用缓存
        if (itemGetCache[pubTimeStamp]) {
            console.log('use cache:' + itemGetCache[pubTimeStamp]);
            return Promise.resolve(itemGetCache[pubTimeStamp]);
        } else {
            console.log('use api');
            var itemQuery = new AV.Query(Item);
            itemQuery.equalTo("pubTimeStamp", parseInt(pubTimeStamp));
            itemQuery.find().then(function(result) {
                itemGetCache[pubTimeStamp] = result;
            });
            return itemQuery.find();
        }
    },
    equalTo: function(params, config) {
        var itemQuery = new AV.Query(Item);
        for (attr in params) {
            itemQuery.equalTo(attr, params[attr]);
        }
        itemQuery.skip(config.start);
        itemQuery.limit(config.amount);
        return itemQuery.find();
    },
    update: function(objectId, params, itemTimeStamp) {

        var item = AV.Object.createWithoutData('Item', objectId);
        item.set('name', params.name);
        item.set('category', params.category);
        item.set('noBargain', params.noBargain);
        item.set('tel', params.tel);
        item.set('qq', params.qq);
        item.set('location', params.location);
        item.set('price', params.price);
        if (params.detail.join) {
            item.set('detail', params.detail.join('\n'));
        } else {
            item.set('detail', params.detail);
        }

        item.set('wechat', params.wechat);
        return item.save().then(function() {
            itemGetCache[itemTimeStamp] = null;
        });
    },
    setStatus: function(objectId, status, itemTimeStamp) {
        var item = AV.Object.createWithoutData('Item', objectId);
        item.set('status', status);
        return item.save().then(function() {
            itemGetCache[itemTimeStamp] = null;
        });
    },
    getTodayNewItemAmount: function() {
        if (itemGetTodayNewItemAmountCache) {
            console.log('use amount cache');
            return Promise.resolve(itemGetTodayNewItemAmountCache);
        } else {
            console.log('use amount api');
            var date = new Date();
            var dateStr = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + ' 00:00:00';
            var categories = ['电器日用', '校园代步', '闲置数码', '美妆衣物', '图书教材', '运动棋牌', '票券小物'];
            var amount = {};
            return Promise.map(categories, function(category) {
                var itemQuery = new AV.Query(Item);
                itemQuery.greaterThan("createdAt", new Date(dateStr));
                itemQuery.equalTo('category', category);
                itemQuery.notContainedIn("status", ["saled", "undercarriage"]);
                return itemQuery.find().then(function(result) {
                    amount[category] = result.length;
                });
            }).then(function() {
                itemGetTodayNewItemAmountCache = amount;
                return amount;
            });
        }
    }
};

var user = {
    signup: function(username, password, name, tel, captcha) {
        var user = new AV.User();
        var params = {
            mobilePhoneNumber: tel,
            smsCode: captcha,
            username: username,
            password: password,
            pwd: password,
            name: name,
            timeStamp: new Date().getTime()
        };
        console.log('service:' + JSON.stringify(params));
        return user.signUpOrlogInWithMobilePhone(params).then(function(user) {
            user.set("username", tel);
            user.set("password", password);
            return user.signUp();
        });

        // user.set("pwd", password);
        // user.set("name", name);
        // user.setMobilePhoneNumber(tel);
        // user.set('timeStamp', new Date().getTime());
        // return user.signUp();
    },
    login: function(username, password) {
        return AV.User.logIn(username, password);
    },
    getUserObjectId: function(userid) {
        var query = new AV.Query(AV.User);
        query.equalTo("timeStamp", userid);
        return query.find();
    },
    requestMailVerify: function(mailAddress, userid) {
        return this.getUserObjectId(userid).then(function(result) {
                console.log(result[0].id);
                var query = new AV.Query(AV.User);
                return query.get(result[0].id);
            })
            .then(function(user) {
                console.log(user);
                return AV.User.logIn(user.get('username'), user.get('pwd'))
            })
            .then(function(user) {
                user.set('email', mailAddress);
                return user.save();
            })
            .then(function(user) {
                console.log(user.id);
                return mail.send(mailAddress, "【复旦二手工坊账号验证】", '<p>测试阶段暂时访问这个url：</p>' + '<p>http://10.108.81.230:3000/api/user/mail_verify/' + user.id + '</p>');
            }, function(err) {
                console.log(err);
                return err;
            })

    },
    mailVerify: function(objectId) {
        var query = new AV.Query(AV.User);
        return query.get(objectId)
            .then(function(user) {
                console.log(user);
                return AV.User.logIn(user.get('username'), user.get('pwd')).then(function(user) {
                    user.set('emailVerified', true);
                    return user.save();
                })
            }, function(err) {
                console.log(err);
                return err;
            });
    },
    requestPasswordReset: function(tel) {
        return AV.User.requestPasswordResetBySmsCode(tel);
    },
    resetPassword: function(captcha, newPassword) {
        return AV.User.resetPasswordBySmsCode(captcha, newPassword)
            .then(function(result) {
                var query = new AV.Query(AV.User);
                return query.get(result.objectId);
            })
            .then(function(user) {
                return AV.User.logIn(user.get('username'), user.get('pwd'));
            })
            .then(function(user) {
                user.set('pwd', newPassword);
                return user.save();
            }, function(err) {
                return err;
            })
    }
};


module.exports = {
    item: item,
    login: login,
    mail: mail,
    user: user,
    sms: sms
}
