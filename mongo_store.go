package main

import (
	"gopkg.in/mgo.v2"
)

type MongoStore struct {
	collection *mgo.Collection
}

func NewMongoStore(collection *mgo.Collection) *MongoStore {
	return &MongoStore{collection: collection}
}
