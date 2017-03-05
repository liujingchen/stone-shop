const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');

const multer = require('multer');
const upload = multer({storage: multer.diskStorage({'dest': '/tmp/'})});

const mongodb = require('mongodb');
const users = require('./users.json');
const MongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;
const GridStore = mongodb.GridStore;
const GridFSBucket = mongodb.GridFSBucket;
const MONGO_URL = 'mongodb://localhost:27017/stoneshop';
const FAILED_TO_CONNECT = 'Failed to connect to DB.';
const COL_ITEM = 'items';
const COL_IMG = 'itemImg';

const passport = require('passport');
const BasicStrategy = require('passport-http').BasicStrategy;
const app = express();
let db;

app.use('/static', express.static('html/static'));
app.use(bodyParser.urlencoded({'extended': false}));
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Internal Error!');
});
app.set('view engine', 'pug');
passport.use(new BasicStrategy(
  function(username, password, done) {
      if (users[username] == password) {
          done(null, username);
          return;
      }
      done(null, false);
  }
));

const mw = {
    'auth': passport.authenticate('basic', {'session': false}),
    'upload': upload.single('imgFile'),
};

app.get('/', mw.auth, function(req, res) {
    let step = '1';
    if ('step' in req.query) {
        step = req.query.step;
    }

    let col = db.collection(COL_ITEM);
    let queryObj = buildQueryFromStep(step);
    col.find(queryObj).toArray(function(err, docs) {
        if (err != null) {
            res.status(500).send('Failed to get items from DB.');
            console.log(err);
        } else {
            res.render('item_list', {'items': docs});
        }
    });
});

function buildQueryFromStep(step) {
    switch(step) {
        case '1': return notExistQuery('photo');
        case '2': return {'$or': [
            notExistQuery('size'),
            notExistQuery('weight'),
            notExistQuery('carat'),
        ]};
        case '3': return {'$and': [
            existQuery('size'),
            existQuery('weight'),
            existQuery('carat'),
            existQuery('photo'),
            notExistQuery('yahooId'),
        ]};
        case '4': return {'$and': [
            existQuery('yahooId'),
            notExistQuery('buyerName'),
        ]};
        case '5': return existQuery('buyerName');
    }
    return {};
}

function existQuery(field) {
    let obj = {'$and': [{}, {}, {}]};
    obj.$and[0][field] = {'$exists': true};
    obj.$and[1][field] = {'$ne': ''};
    obj.$and[2][field] = {'$ne': []};
    return obj;
}

function notExistQuery(field) {
    let obj = {'$or': [{}, {}, {}]};
    obj.$or[0][field] = {'$exists': false};
    obj.$or[1][field] = {'$eq': ''};
    obj.$or[2][field] = {'$eq': []};
    return obj;
}

app.get('/create', mw.auth, function(req, res) {
    res.render('create');
});

app.post('/item_create', mw.auth, function(req, res) {
    let col = db.collection(COL_ITEM);
    col.insertOne(req.body, function(err, r) {
        if (err != null || r.insertedCount != 1) {
            res.status(500).send('Failed to insert item to DB.');
        } else {
            res.redirect('/item/' + r.insertedId);
        }
    });
});

app.get('/item/:itemId', mw.auth, function(req, res) {
    let col = db.collection(COL_ITEM);
    col.find({'_id': new ObjectId(req.params.itemId)}).limit(1).toArray(
        function(err, docs) {
            if (err != null || docs.length != 1) {
                res.status(500).send('Failed to get one item from DB.');
            } else {
                res.render('item', {'item': docs[0]});
            }
        }
    );
});

app.post('/item_update', mw.auth, function(req, res) {
    let col = db.collection(COL_ITEM);
    let data = Object.assign({}, req.body);
    delete data._id;
    col.updateOne({'_id': new ObjectId(req.body._id)}, {'$set': data},
        function(err, r) {
            if (err != null) {
                res.status(500).send('Failed to update item to DB.');
            } else {
                res.redirect('/item/' + req.body._id);
            }
        }
    );
});

app.post('/item_delete', mw.auth, function(req, res) {
    let col = db.collection(COL_ITEM);
    let itemId = req.body._id;
    col.find({'_id': new ObjectId(itemId)}).limit(1).toArray(
        function(err, docs) {
            if (err != null || docs.length != 1) {
                res.status(500).send('Failed to get imgs from item when' +
                        ' delete.');
                return;
            }
            let imgIds = docs[0].photo;
            if (imgIds) {
                for (let imgId of imgIds) {
                    deleteImg(imgId);
                }
            }
            col.deleteOne({'_id': new ObjectId(req.body._id)},
                function(err, r) {
                    if (err != null || r.deletedCount != 1) {
                        res.status(500).send('Failed to delete item from DB.');
                    } else {
                        res.redirect('/');
                    }
                }
            );
        }
    );
});

function deleteImg(imgId) {
    let bucket = new GridFSBucket(db, {'bucketName': COL_IMG});

    bucket.delete(new ObjectId(imgId), function(err) {
        if (err != null) {
            console.error('Failed to delete image ' + imgId);
        } else {
            console.info('Deleted image ' + imgId);
        }
    });
}

app.post('/img_upload', [mw.auth, mw.upload], function(req, res) {
    let imgId = new ObjectId();
    let gridStore = new GridStore(db, imgId, req.file.originalname,
            'w', {'root': COL_IMG, 'content_type': req.file.mimetype});
    gridStore.writeFile(req.file.path, function(err, doc) {
        if(err != null) {
            res.status(500).send('Failed to save img.');
        } else {
            let col = db.collection(COL_ITEM);
            col.updateOne({'_id': new ObjectId(req.body._id)},
                {'$push': {'photo': imgId.toString()}},
                function(err, r) {
                    if (err != null) {
                        res.status(500).send('Failed to add img to item.');
                    } else {
                        res.redirect('/item/' + req.body._id);
                    }
                }
            );
        }
        fs.unlink(req.file.path, function(err) {
            if (err != null) {
                console.warn('Failed to remove tmp file ' + req.file.path);
            }
        });
    });
});

function handleImgGet(req, res, disposition, summary) {
    let imgId = req.params.imgId;
    let imgIdObj = new ObjectId(imgId);
    let gridStore = new GridStore(db, imgIdObj, '', 'r', {'root': COL_IMG});
    gridStore.open(function(err, gridStore) {
        if (err != null) {
            res.status(404).send('Image Not Found');
            return;
        }
        gridStore.close(function(err) {
            if (err != null) {
                res.status(500).send('Failed to close grid store.');
                return;
            }

            let bucket = new GridFSBucket(db, {'bucketName': COL_IMG});
            bucket.openDownloadStream(imgIdObj)
                .on('file', function(file) {
                    res.setHeader('content-type', file.contentType);
                    let filename = (summary? summary + '_':'') + file.filename;
                    res.setHeader('Content-Disposition',
                            disposition + '; filename="'
                            + encodeURI(filename) + '"');
                })
                .pipe(res);
        });
    });
}

app.get('/img/:imgId', mw.auth, function(req, res) {
    handleImgGet(req, res, 'inline', null);
});

app.get('/img_download/:imgId', mw.auth, function(req, res) {
    let summary = 'summary' in req.query ? req.query.summary : null;
    handleImgGet(req, res, 'attatchment', summary);
});

app.post('/img_delete/:itemId/:imgId', mw.auth, function(req, res) {
    let itemId = req.params.itemId;
    let imgId = req.params.imgId;
    let col = db.collection(COL_ITEM);
    col.updateOne({'_id': new ObjectId(itemId)},
        {'$pull': {'photo': imgId}},
        function(err, r) {
            if (err != null) {
                res.status(500).send('Failed to add img to item.');
            } else {
                res.redirect('/item/' + itemId);
                deleteImg(imgId);
            }
        }
    );
});

MongoClient.connect(MONGO_URL, function(err, dbResult) {
    if(err != null) {
        console.error(FAILED_TO_CONNECT + ": " + err);
        return;
    }
    db = dbResult;
    app.listen(8080, function() {
        console.log('Wep app listening on port 8080!');
    });
});
