package main

import "html/template"
import "net/http"

func handler(w http.ResponseWriter, r *http.Request) {
	t, _ := template.ParseFiles("html/demo.html")
	t.Execute(w, nil)
}

func main() {
	fs := http.FileServer(http.Dir("html/static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))
	http.HandleFunc("/", handler)
	http.ListenAndServe(":8080", nil)
}
