{
	"patcher": {
		"fileversion": 1,
		"appversion": {
			"major": 8,
			"minor": 6,
			"revision": 0,
			"architecture": "x64",
			"modernui": 1
		},
		"classnamespace": "box",
		"rect": [
			80,
			80,
			1200,
			700
		],
		"openinpresentation": 1,
		"default_fontsize": 10,
		"default_fontname": "Arial",
		"devicewidth": 560,
		"description": "Spectral Relief: the spectrum as a printed mountain range",
		"boxes": [
			{
				"box": {
					"id": "obj-1",
					"maxclass": "newobj",
					"text": "plugin~ 2",
					"patching_rect": [
						20,
						20,
						70,
						22
					],
					"numinlets": 2,
					"numoutlets": 2,
					"outlettype": [
						"signal",
						"signal"
					]
				}
			},
			{
				"box": {
					"id": "obj-2",
					"maxclass": "newobj",
					"text": "plugout~ 2",
					"patching_rect": [
						20,
						330,
						70,
						22
					],
					"numinlets": 2,
					"numoutlets": 0
				}
			},
			{
				"box": {
					"id": "obj-3",
					"maxclass": "newobj",
					"text": "+~",
					"patching_rect": [
						120,
						60,
						30,
						22
					],
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [
						"signal"
					]
				}
			},
			{
				"box": {
					"id": "obj-4",
					"maxclass": "newobj",
					"text": "*~ 0.5",
					"patching_rect": [
						120,
						90,
						45,
						22
					],
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [
						"signal"
					]
				}
			},
			{
				"box": {
					"id": "obj-5",
					"maxclass": "newobj",
					"text": "pfft~ sr.fft~ 2048 2",
					"patching_rect": [
						120,
						150,
						130,
						22
					],
					"numinlets": 2,
					"numoutlets": 0
				}
			},
			{
				"box": {
					"id": "obj-6",
					"maxclass": "newobj",
					"text": "buffer~ ---srspec @samps 1024 1",
					"patching_rect": [
						300,
						150,
						190,
						22
					],
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": [
						"float",
						"bang"
					]
				}
			},
			{
				"box": {
					"id": "obj-7",
					"maxclass": "newobj",
					"text": "loadbang",
					"patching_rect": [
						300,
						20,
						60,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						"bang"
					]
				}
			},
			{
				"box": {
					"id": "obj-8",
					"maxclass": "newobj",
					"text": "t b b b",
					"patching_rect": [
						300,
						50,
						60,
						22
					],
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": [
						"bang",
						"bang",
						"bang"
					]
				}
			},
			{
				"box": {
					"id": "obj-9",
					"maxclass": "message",
					"patching_rect": [
						300,
						110,
						120,
						22
					],
					"text": "set ---srspec",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-10",
					"maxclass": "message",
					"patching_rect": [
						430,
						110,
						130,
						22
					],
					"text": "setbuf ---srspec",
					"numinlets": 2,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-11",
					"maxclass": "newobj",
					"text": "dspstate~",
					"patching_rect": [
						580,
						80,
						70,
						22
					],
					"numinlets": 1,
					"numoutlets": 4,
					"outlettype": [
						"int",
						"float",
						"int",
						"int"
					]
				}
			},
			{
				"box": {
					"id": "obj-12",
					"maxclass": "newobj",
					"text": "prepend sr",
					"patching_rect": [
						580,
						110,
						70,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-13",
					"maxclass": "v8ui",
					"patching_rect": [
						300,
						200,
						440,
						161
					],
					"filename": "spectral-relief-v8.js",
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					],
					"presentation": 1,
					"presentation_rect": [
						4,
						4,
						440,
						161
					],
					"border": 0,
					"parameter_enable": 0
				}
			},
			{
				"box": {
					"id": "obj-14",
					"maxclass": "live.tab",
					"patching_rect": [
						880,
						200,
						100,
						20
					],
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": [
						"",
						"",
						"float"
					],
					"parameter_enable": 1,
					"num_lines_patching": 1,
					"num_lines_presentation": 1,
					"presentation": 1,
					"presentation_rect": [
						450,
						4,
						106,
						17
					],
					"varname": "Ink",
					"fontsize": 9,
					"saved_attribute_attributes": {
						"valueof": {
							"parameter_enum": [
								"dots",
								"stipple",
								"lines"
							],
							"parameter_longname": "Ink",
							"parameter_shortname": "Ink",
							"parameter_type": 2,
							"parameter_mmax": 2,
							"parameter_initial": [
								0
							],
							"parameter_initial_enable": 1
						}
					}
				}
			},
			{
				"box": {
					"id": "obj-15",
					"maxclass": "newobj",
					"text": "prepend mode",
					"patching_rect": [
						880,
						222,
						90,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-16",
					"maxclass": "live.tab",
					"patching_rect": [
						880,
						240,
						100,
						20
					],
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": [
						"",
						"",
						"float"
					],
					"parameter_enable": 1,
					"num_lines_patching": 1,
					"num_lines_presentation": 1,
					"presentation": 1,
					"presentation_rect": [
						450,
						24,
						106,
						17
					],
					"varname": "Colour",
					"fontsize": 9,
					"saved_attribute_attributes": {
						"valueof": {
							"parameter_enum": [
								"print",
								"alpenglow"
							],
							"parameter_longname": "Colour",
							"parameter_shortname": "Colour",
							"parameter_type": 2,
							"parameter_mmax": 1,
							"parameter_initial": [
								0
							],
							"parameter_initial_enable": 1
						}
					}
				}
			},
			{
				"box": {
					"id": "obj-17",
					"maxclass": "newobj",
					"text": "prepend colour",
					"patching_rect": [
						880,
						262,
						90,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-18",
					"maxclass": "live.dial",
					"patching_rect": [
						1000,
						280,
						44,
						48
					],
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": [
						"",
						"float"
					],
					"parameter_enable": 1,
					"presentation": 1,
					"presentation_rect": [
						450,
						44,
						44,
						48
					],
					"varname": "Depth",
					"fontsize": 9,
					"saved_attribute_attributes": {
						"valueof": {
							"parameter_longname": "Depth",
							"parameter_shortname": "Depth",
							"parameter_type": 0,
							"parameter_mmin": 8,
							"parameter_mmax": 48,
							"parameter_initial": [
								24
							],
							"parameter_initial_enable": 1,
							"parameter_unitstyle": 0
						}
					}
				}
			},
			{
				"box": {
					"id": "obj-19",
					"maxclass": "newobj",
					"text": "prepend planes",
					"patching_rect": [
						1060,
						302,
						90,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-20",
					"maxclass": "live.dial",
					"patching_rect": [
						1000,
						320,
						44,
						48
					],
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": [
						"",
						"float"
					],
					"parameter_enable": 1,
					"presentation": 1,
					"presentation_rect": [
						506,
						44,
						44,
						48
					],
					"varname": "Height",
					"fontsize": 9,
					"saved_attribute_attributes": {
						"valueof": {
							"parameter_longname": "Height",
							"parameter_shortname": "Height",
							"parameter_type": 0,
							"parameter_mmin": 0.15,
							"parameter_mmax": 0.75,
							"parameter_initial": [
								0.48
							],
							"parameter_initial_enable": 1,
							"parameter_unitstyle": 5
						}
					}
				}
			},
			{
				"box": {
					"id": "obj-21",
					"maxclass": "newobj",
					"text": "prepend height",
					"patching_rect": [
						1060,
						342,
						90,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-22",
					"maxclass": "live.dial",
					"patching_rect": [
						1000,
						360,
						44,
						48
					],
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": [
						"",
						"float"
					],
					"parameter_enable": 1,
					"presentation": 1,
					"presentation_rect": [
						450,
						106,
						44,
						48
					],
					"varname": "Rough",
					"fontsize": 9,
					"saved_attribute_attributes": {
						"valueof": {
							"parameter_longname": "Rough",
							"parameter_shortname": "Rough",
							"parameter_type": 0,
							"parameter_mmin": 0,
							"parameter_mmax": 1,
							"parameter_initial": [
								0.45
							],
							"parameter_initial_enable": 1,
							"parameter_unitstyle": 5
						}
					}
				}
			},
			{
				"box": {
					"id": "obj-23",
					"maxclass": "newobj",
					"text": "prepend jag",
					"patching_rect": [
						1060,
						382,
						90,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-24",
					"maxclass": "live.dial",
					"patching_rect": [
						1000,
						400,
						44,
						48
					],
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": [
						"",
						"float"
					],
					"parameter_enable": 1,
					"presentation": 1,
					"presentation_rect": [
						506,
						106,
						44,
						48
					],
					"varname": "Screen",
					"fontsize": 9,
					"saved_attribute_attributes": {
						"valueof": {
							"parameter_longname": "Screen",
							"parameter_shortname": "Screen",
							"parameter_type": 0,
							"parameter_mmin": 2.5,
							"parameter_mmax": 8,
							"parameter_initial": [
								4
							],
							"parameter_initial_enable": 1,
							"parameter_unitstyle": 1
						}
					}
				}
			},
			{
				"box": {
					"id": "obj-25",
					"maxclass": "newobj",
					"text": "prepend cell",
					"patching_rect": [
						1060,
						422,
						90,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "obj-26",
					"maxclass": "live.text",
					"patching_rect": [
						1000,
						600,
						44,
						18
					],
					"numinlets": 1,
					"numoutlets": 2,
					"outlettype": [
						"",
						""
					],
					"parameter_enable": 1,
					"mode": 0,
					"text": "freeze",
					"texton": "frozen",
					"presentation": 1,
					"presentation_rect": [
						450,
						150,
						106,
						15
					],
					"varname": "Freeze",
					"saved_attribute_attributes": {
						"valueof": {
							"parameter_enum": [
								"val1",
								"val2"
							],
							"parameter_longname": "Freeze",
							"parameter_shortname": "Freeze",
							"parameter_type": 2,
							"parameter_mmax": 1
						}
					}
				}
			},
			{
				"box": {
					"id": "obj-27",
					"maxclass": "newobj",
					"text": "prepend freeze",
					"patching_rect": [
						1000,
						630,
						90,
						22
					],
					"numinlets": 1,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			}
		],
		"lines": [
			{
				"patchline": {
					"source": [
						"obj-1",
						0
					],
					"destination": [
						"obj-2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-1",
						1
					],
					"destination": [
						"obj-2",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-1",
						0
					],
					"destination": [
						"obj-3",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-1",
						1
					],
					"destination": [
						"obj-3",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-3",
						0
					],
					"destination": [
						"obj-4",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-4",
						0
					],
					"destination": [
						"obj-5",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-7",
						0
					],
					"destination": [
						"obj-8",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-8",
						2
					],
					"destination": [
						"obj-9",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-8",
						1
					],
					"destination": [
						"obj-10",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-8",
						0
					],
					"destination": [
						"obj-11",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-9",
						0
					],
					"destination": [
						"obj-5",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-11",
						1
					],
					"destination": [
						"obj-12",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-10",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-12",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-14",
						0
					],
					"destination": [
						"obj-15",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-15",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-16",
						0
					],
					"destination": [
						"obj-17",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-17",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-18",
						0
					],
					"destination": [
						"obj-19",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-19",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-20",
						0
					],
					"destination": [
						"obj-21",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-21",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-22",
						0
					],
					"destination": [
						"obj-23",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-23",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-24",
						0
					],
					"destination": [
						"obj-25",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-25",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-26",
						0
					],
					"destination": [
						"obj-27",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"obj-27",
						0
					],
					"destination": [
						"obj-13",
						0
					]
				}
			}
		],
		"dependency_cache": [
			{
				"name": "spectral-relief-v8.js",
				"bootpath": ".",
				"type": "TEXT",
				"implicit": 1
			},
			{
				"name": "sr.fft~.maxpat",
				"bootpath": ".",
				"type": "JSON",
				"implicit": 1
			}
		]
	}
}
