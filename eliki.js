"use strict";

const alert = require('./modules/alert.js').alert;
const app = require('electron').remote.app;
const escape = require('escape-html');
const fs = require('fs');
const ipcRenderer = require('electron').ipcRenderer;
const marked = require('marked');
const path = require('path');
const sanitize = require('sanitize-filename');
const shell = require('electron').shell;
const unescape = require('unescape-html');

// -----------------------------------------------------------------------------

marked.setOptions({sanitize: true});	// Important!

const userdata_path = app.getPath('userData');
const pages_dir_path = path.join(userdata_path, 'pages');

// -----------------------------------------------------------------------------

let eliki = {

	reset: function() {
		this.page = "";				// Page name this.go() was called with
		this.escaped = "";			// Escaped version of the page name
		this.filename = "";			// Page name with only alphanumeric chars (plus space)
		this.filepath = "";			// Complete path for the file we are dealing with

		this.markup = "";			// Markup read from the file
		this.content = "";			// Result after parsing the markup
		this.internal = [];			// All internal links
		this.external = [];			// All external links

		this.editable = false;		// Are we allowed to edit this
	},

	go: function(s) {

		if (s === undefined) {
			s = this.page;
		}
		if (typeof s === 'number') {
			s = this.internal[s];
		}

		this.setup(s);

		if (this.filename === '') {
			alert("Tried to go to <empty string>");
			this.go("Index");
		}

		if (fs.existsSync(this.filepath)) {
			this.markup = fs.readFileSync(this.filepath, 'UTF8');
		} else {
			this.markup = ''
		}

		this.editable = true;

		this.parse_and_view();
	},

	setup: function(s) {
		this.reset();
		this.page = s;
		this.escaped = escape(s);
		this.filename = sanitize(this.page.toLowerCase());
		this.filepath = path.join(pages_dir_path, this.filename);
	},

	parse: function() {

		let result = this.markup;
		result = marked(result);

		// Each internal [[link]] gets put in the array of links, so
		// they can be referred to by number, which is safer.

		this.internal = [];

		while (1) {
			let m = result.match(/(\[\[.*?\]\])/);
			if (m === null) {
				break;
			}

			// marked is set (elsewhere) to sanitize input, i.e. escape HTML chars.
			// So for our records, we must unescape them.

			let target_escaped = m[1].slice(2, -2);
			let target_raw = unescape(target_escaped);
			this.internal.push(target_raw);

			let id = this.internal.length - 1;
			result = result.replace(m[1], `<a href="#" onclick="eliki.go(${id}); return false;">${target_escaped}</a>`);
		}

		this.content = result;
	},

	view: function() {
		let everything = '';
		if (this.editable) {
			everything += '<h1><span id="title"></span> &nbsp; [<a href="#" onclick="eliki.edit(); return false;">edit</a>]</h1>\n';
		} else {
			everything += '<h1>Special: <span id="title"></span></h1>\n';
		}
		everything += this.content;
		document.querySelector('#everything').innerHTML = everything;
		document.querySelector('#title').innerHTML = this.escaped;

		// We replace all external <a> tags with calls to this.open_external()
		// storing targets in the this.external array so we can refer by number...

		this.external = [];

		let a_tags = document.getElementsByTagName("a");

		for (let i = 0; i < a_tags.length; i++) {
			if (a_tags[i].getAttribute('href') !== '#') {
				let target = encodeURI(a_tags[i].getAttribute('href'))
				this.external.push(target);
				let id = this.external.length - 1;
				a_tags[i].setAttribute('onclick', `eliki.open_external(${id}); return false;`);
				a_tags[i].setAttribute('class', 'external');
				a_tags[i].setAttribute('href', '#');
			}
		}
	},

	parse_and_view: function() {
		this.parse();
		this.view();
	},

	edit: function() {
		if (this.editable === false) {
			alert("Cannot edit this page.");
			return;
		}
		let everything = '';
		everything += '<h1>Editing <span id="title"></span></h1>\n';
		everything += '<div><button onclick="eliki.save()">Save</button> &nbsp; <button onclick="eliki.go()">Cancel</button><br><br></div>\n';
		everything += '<div id="editordiv"><textarea id="editor"></textarea></div>\n';
		document.querySelector('#everything').innerHTML = everything;
		document.querySelector('#editor').value = this.markup;
		document.querySelector('#title').innerHTML = this.escaped;
		allow_tabs();
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
	},

	list_all_pages: function() {
		this.setup("List All Pages");

		let all_pages = fs.readdirSync(pages_dir_path);
		all_pages.sort();

		for (let n = 0; n < all_pages.length; n++) {
			this.markup += "* [[" + all_pages[n] + "]]\n";
		}

		this.parse_and_view();
	}
}

// -----------------------------------------------------------------------------

function allow_tabs() {

	// http://stackoverflow.com/questions/22668818/undo-tab-in-textarea
	// Maybe Chrome specific, but this is Chrome, so...

	let ta = document.querySelector("#editor");
	ta.addEventListener("keydown", function(e) {
		if (e.which === 9) {
			e.preventDefault();
			document.execCommand("insertText", false, "\t");
		}
	}, false);
}

// -----------------------------------------------------------------------------

ipcRenderer.on('view', (event, arg) => {
	eliki.go(arg);
});

ipcRenderer.on('list_all_pages', (event, arg) => {
	eliki.list_all_pages();
});

if (fs.existsSync(pages_dir_path) === false) {
	fs.mkdirSync(pages_dir_path);
}

// -----------------------------------------------------------------------------

eliki.reset();
eliki.go("Index");
