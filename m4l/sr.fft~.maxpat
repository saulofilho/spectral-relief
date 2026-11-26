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
			100,
			100,
			400,
			200
		],
		"boxes": [
			{
				"box": {
					"id": "f-1",
					"maxclass": "newobj",
					"text": "fftin~ 1 hanning",
					"patching_rect": [
						20,
						20,
						110,
						22
					],
					"numinlets": 1,
					"numoutlets": 3,
					"outlettype": [
						"signal",
						"signal",
						"signal"
					]
				}
			},
			{
				"box": {
					"id": "f-2",
					"maxclass": "newobj",
					"text": "cartopol~",
					"patching_rect": [
						20,
						60,
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
					"id": "f-3",
					"maxclass": "newobj",
					"text": "in 2",
					"patching_rect": [
						180,
						20,
						40,
						22
					],
					"numinlets": 0,
					"numoutlets": 1,
					"outlettype": [
						""
					]
				}
			},
			{
				"box": {
					"id": "f-4",
					"maxclass": "newobj",
					"text": "poke~ sr_unset",
					"patching_rect": [
						20,
						110,
						120,
						22
					],
					"numinlets": 3,
					"numoutlets": 0,
					"outlettype": []
				}
			}
		],
		"lines": [
			{
				"patchline": {
					"source": [
						"f-1",
						0
					],
					"destination": [
						"f-2",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"f-1",
						1
					],
					"destination": [
						"f-2",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"f-2",
						0
					],
					"destination": [
						"f-4",
						0
					]
				}
			},
			{
				"patchline": {
					"source": [
						"f-1",
						2
					],
					"destination": [
						"f-4",
						1
					]
				}
			},
			{
				"patchline": {
					"source": [
						"f-3",
						0
					],
					"destination": [
						"f-4",
						0
					]
				}
			}
		]
	}
}
