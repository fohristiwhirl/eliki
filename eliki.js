"use strict";

const alert = require('./modules/alert.js').alert;
const app = require('electron').remote.app;
const escape = require('escape-html');
const fs = require('fs');
const ipcRenderer = require('electron').ipcRenderer;
const marked = require('marked');
const path = require('path');
const shell = require('electron').shell;

// -----------------------------------------------------------------------------

const userdata_path = app.getPath('userData');
const pages_dir_path = path.join(userdata_path, 'pages');

let state = {

	page: "",		// Page name this.go() was called with
	escaped: "",	// Escaped version of the page name
	filename: "",	// Page name with only alphanumeric chars (plus space)
	filepath: "",	// Complete path for the file we are dealing with
	internal: [],	// All internal links
	external: [],	// All external links
	markup: "",		// Markup read from the file
	content: "",	// Result after parsing the markup

	go: function(s) {
		if (s === undefined) {
			s = this.page;
		}
		if (typeof s === 'number') {
			s = this.internal[s];
		}
		this.page = s;
		this.escaped = escape(s);
		this.set_paths();

		if (this.filename === '') {
			alert("Tried to go to <empty string>");
			this.go("Index");
		}

		if (fs.existsSync(this.filepath)) {
			this.markup = fs.readFileSync(this.filepath, 'UTF8');
		} else {
			this.markup = ''
		}
		this.parse();
		this.view();
	},

	set_paths: function() {

		this.filename = '';

		let page_lower = this.page.toLowerCase();

		for (let n = 0; n < page_lower.length; n++) {
			let c = page_lower.charAt(n);
			if (c.match(/[a-zA-Z0-9 ]/)) {
				this.filename += c;
			}
		}

		if (this.filename.length > 255) {
			this.filename = this.filename.slice(0, 255);
		}

		this.filepath = path.join(pages_dir_path, this.filename);
	},

	parse: function() {

		let result = this.markup;

		// Each internal link gets put in the array of links, so they can
		// be referred to by number, which is safer.

		this.internal = [];

		// Handle [[links]]

		while (1) {
			let m = result.match(/(\[\[.*?\]\])/);
			if (m === null) {
				break;
			}
			let target = m[1].slice(2, -2);
			this.internal.push(target);
			let i = this.internal.length - 1;
			result = result.replace(m[1], `<a href="#" onclick="state.go(${i}); return false;">${escape(target)}</a>`);
		}

		// Handle Markdown

		result = marked(result);

		// Done

		this.content = result;
	},

	view: function() {
		let everything = '';
		everything += `<h1><span id="title"></span> &nbsp; [<a href="#" onclick="state.edit(); return false;">edit</a>]</h1>`;
		everything += this.content;
		document.querySelector('#content').innerHTML = everything;
		document.querySelector('#title').innerHTML = this.escaped;

		// We replace all real a tags with calls to this.open_external()
		// storing targets in the this.external array...

		this.external = [];

		let a_tags = document.getElementsByTagName("a");

		for (let i = 0; i < a_tags.length; i++) {
			if (a_tags[i].getAttribute('href') !== '#') {
				let target = encodeURI(a_tags[i].getAttribute('href'))
				this.external.push(target);
				let id = this.external.length - 1;
				a_tags[i].setAttribute('onclick', `state.open_external(${id}); return false;`);
				a_tags[i].setAttribute('class', 'external');
				a_tags[i].setAttribute('href', '#');
			}
		}
	},

	edit: function() {
		let everything = '';
		everything += `<h1>Editing <span id="title"></span></h1>`;
		everything += `<div><button onclick="state.save()">Save</button> &nbsp; <button onclick="state.go()">Cancel</button><br><br></div>`;
		everything += `<div id="editordiv"><textarea id="editor"></textarea></div>`;
		document.querySelector('#content').innerHTML = everything;
		document.querySelector('#editor').value = this.markup;
		document.querySelector('#title').innerHTML = this.escaped;
	},

	save: function() {
		let new_markup = document.querySelector('#editor').value;
		if (new_markup.trim() === '') {
			if (fs.existsSync(this.filepath)) {
				fs.unlinkSync(this.filepath);
			}
		} else {
			fs.writeFileSync(this.filepath, new_markup, 'UTF8');
		}
		this.go();
	},

	open_external: function(i) {
		try {
			shell.openExternal(this.external[i]);
		} catch (err) {
			// I dunno what could go wrong.
		}
	}
}

// -----------------------------------------------------------------------------

ipcRenderer.on('view', (event, arg) => {
	state.go(arg);
});

ipcRenderer.on('list_all_pages', (event, arg) => {
	alert("TODO");
});

if (fs.existsSync(pages_dir_path) === false) {
	fs.mkdirSync(pages_dir_path);
}

state.go("Index");
