package main

type ItemStatus int

type Item struct {
	Id            string
	Status        ItemStatus
	Size          int
	YahooUrl      string
	BuyerName     string
	BuyerPostCode string
	BuyerAddress  string
}

const (
	New ItemStatus = iota
	HasImage
	HasInfo
	OnSale
	Sold
	Sent
)

type DataAccessor interface {
	CreateNewItem() (string, error)
	UpdateItem() error
	DeleteItem() error
}
