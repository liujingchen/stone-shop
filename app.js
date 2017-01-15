const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer({storage: multer.diskStorage({'dest': '/tmp/'})});
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;
const GridStore = mongodb.GridStore;
const GridFSBucket = mongodb.GridFSBucket;
const MONGO_URL = 'mongodb://localhost:27017/stoneshop';
const FAILED_TO_CONNECT = 'Failed to connect to DB.';
const COL_ITEM = 'items';
const COL_IMG = 'itemImg';
const app = express();
let db;
app.use('/static', express.static('html/static'));
app.use(bodyParser.urlencoded({'extended': false}));
app.set('view engine', 'pug');

app.get('/', function(req, res) {
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
        case '2': return notExistQuery('size');
        case '3': return {'$and': [
            existQuery('size'),
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

app.get('/create', function(req, res) {
    res.render('create');
});

app.post('/item_create', function(req, res) {
    let col = db.collection(COL_ITEM);
    col.insertOne(req.body, function(err, r) {
        if (err != null || r.insertedCount != 1) {
            res.status(500).send('Failed to insert item to DB.');
        } else {
            res.redirect('/item/' + r.insertedId);
        }
    });
});

app.get('/item/:itemId', function(req, res) {
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

app.post('/item_update', function(req, res) {
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

app.post('/item_delete', function(req, res) {
    let col = db.collection(COL_ITEM);
    col.deleteOne({'_id': new ObjectId(req.body._id)}, function(err, r) {
        if (err != null || r.deletedCount != 1) {
            res.status(500).send('Failed to delete item from DB.');
        } else {
            res.redirect('/');
        }
    });
});

app.post('/img_upload', upload.single('imgFile'), function(req, res) {
    let imgId = new ObjectId();
    let gridStore = new GridStore(db, imgId, req.file.filename,
            'w', {'root': COL_IMG});
    gridStore.writeFile(req.file.path, function(err, doc) {
        if(err != null) {
            res.status(500).send('Failed to save img.');
        } else {
            let col = db.collection(COL_ITEM);
            col.updateOne({'_id': new ObjectId(req.body._id)},
                {'$push': {'photo': imgId}},
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

app.get('/img/:imgId', function(req, res) {
    let imgId = req.params.imgId;
    let bucket = new GridFSBucket(db, {'bucketName': COL_IMG});
    res.setHeader('content-type', 'image/jpg');
    bucket.openDownloadStream(new ObjectId(imgId)).pipe(res);
});


MongoClient.connect(MONGO_URL, function(err, dbResult) {
    if(err != null) {
        res.status(500).send(FAILED_TO_CONNECT);
        return;
    }
    db = dbResult;
    app.listen(8080, function() {
        console.log('Wep app listening on port 8080!');
    });
});
