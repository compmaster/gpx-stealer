const speedFactor = 1

const extras = {
	watts: 'power',
	heartrate: 'gpxtpx:hr',
	cadence: 'gpxtpx:cad',
	temp: 'gpxtpx:atemp'
}

const NS = {
	gpx: 'http://www.topografix.com/GPX/1/1',
	xsd: 'http://www.topografix.com/GPX/1/1/gpx.xsd',
	tpx: 'http://www.garmin.com/xmlschemas/TrackPointExtension/v1',
	xml: 'http://www.w3.org/2000/xmlns/',
	xsi: 'http://www.w3.org/2001/XMLSchema-instance'
}

async function stealGpx() {
	try {
		freezeButton(this);
		const fileHandle = await openFileHandle();
		const data = await getData();
		const gpx = await buildGpx(data);
		await saveToFile(fileHandle, gpx);
	} catch (e) {
		console.error(e);
		alert('Could not steal GPX because ' + e);
	} finally {
		unfreezeButton(this);
	}
}

async function openFileHandle() {
	const activityName = getActivityName();
	return window.showSaveFilePicker?.({
		id: 'StealGPX',
		suggestedName: `${activityName ?? 'Activity'}.gpx`,
		startIn: 'downloads',
		types: [{
			description: 'GPS Exchange Format',
			accept: {
				'application/gpx+xml': ['.gpx']
			},
		}]
	})
}

async function getData() {
	if (document.querySelector('.logged-out')) {
		const props = JSON.parse(document.querySelector('[data-react-props]').dataset.reactProps);
		return props.activity.streams;
	} else {
		return fetchJson();
	}
}

async function fetchJson() {
	const activityId = location.href.match(/\/activities\/(\d+)/)?.[1];
	if (!activityId) {
		throw 'Cannot determine activity ID';
	}
	const types = ['time','altitude','latlng',...Object.keys(extras)]
		.map(t => 'stream_types[]=' + t)
		.join('&');
	const url = `/activities/${activityId}/streams?${types}&_=${Date.now()}`;
	const response = await fetch(url, {
		headers: {
			'accept': 'text/javascript, application/javascript, application/ecmascript, application/x-ecmascript',
			'x-csrf-token': getCsrfToken(),
			'x-requested-with': 'XMLHttpRequest'
		},
		referrer: 'https://www.strava.com/activities/' + activityId,
		mode: 'cors',
		credentials: 'include'
	});
	return response.json();
}

async function buildGpx(data) {
	const size = data.latlng.length;

	const activityDate = new Date(document.querySelector('time')?.textContent);
	const beginTimeMs = activityDate?.getTime() || Date.now();

	const activityName = getActivityName();
	const activityType = getActivityType();

	const doc = document.implementation.createDocument(NS.gpx, 'gpx');
	const gpx = doc.documentElement;
	gpx.setAttribute('creator','StealGPX');
	gpx.setAttributeNS(NS.xml,'xmlns:xsi',NS.xsi);
	gpx.setAttributeNS(NS.xml,'xmlns:gpxtpx',NS.tpx);
	gpx.setAttributeNS(NS.xsi,'xsi:schemaLocation',`${NS.gpx} ${NS.xsi}`);
	gpx.setAttribute('version','1.1');

	const trk = gpx.appendChild(document.createElementNS(NS.gpx,'trk'));
	trk.setAttribute('name',activityName);
	trk.setAttribute('type',activityType);

	const trkseg = trk.appendChild(document.createElementNS(NS.gpx,'trkseg'));

	for (let i=0; i<size; ++i) {
		const trkpt = trkseg.appendChild(document.createElementNS(NS.gpx,'trkpt'));
		trkpt.setAttribute('lat',data.latlng[i][0]);
		trkpt.setAttribute('lon',data.latlng[i][1]);
		const ele = trkpt.appendChild(document.createElementNS(NS.gpx,'ele'));
		ele.append(data.altitude[i]);
		const time = trkpt.appendChild(document.createElementNS(NS.gpx,'time'));
		const timestamp = beginTimeMs + (data.time?.[i] ?? i) * 1000 * speedFactor;
		time.append(new Date(timestamp).toISOString());

		const extensions = document.createElementNS(NS.gpx,'extensions');
		const tpe = document.createElementNS(NS.tpx,'gpxtpx:TrackPointExtension');

		for (const [prop, tagName] of Object.entries(extras)) {
			if (!isNaN(data[prop]?.[i])) {
				if (tagName.startsWith('gpxtpx:')) {
					const tag = document.createElementNS(NS.tpx,tagName);
					tag.append(data[prop][i]);
					tpe.appendChild(tag);
				} else {
					const tag = document.createElementNS(NS.gpx,tagName);
					tag.append(data[prop][i]);
					extensions.appendChild(tag);
				}
			}
		}
		if (tpe.children.length > 0) {
			extensions.appendChild(tpe);
		}
		if (extensions.children.length > 0) {
			trkpt.appendChild(extensions);
		}
	}

	const str = new XMLSerializer().serializeToString(doc);
	return `<?xml version="1.0" encoding="UTF-8"?>${str}`;
}

async function saveToFile(handle, gpx) {
	if (handle) {
		const writableStream = await handle.createWritable();
		await writableStream.write(gpx);
		await writableStream.close();
		alert(`Activity saved to file ${handle.name}.`);
	} else {
		const a = Object.assign(document.createElement('a'), {
			href: `data:application/gpx+xml,${encodeURIComponent(gpx)}`,
			download: `${getActivityName()}.gpx`,
			style: 'display: none'
		});
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
}

function getActivityName() {
	return document.title.split(' | ')?.[0]
		?? document.querySelector('.activity-name')?.innerText?.trim()
		?? 'Activity';
}

function getActivityType() {
	switch(document.title.split(' | ')?.[1]) {
		case 'Ride': return 'cycling';
		case 'Run': return 'running';
		case 'Swim': return 'swimming';
		default: 'uncategorized';
	}
}

function getCsrfToken() {
	return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

function debug(str) {
	window?.console?.debug(`[GPX STEALER] ${str}`);
}

function freezeButton(btn) {
	btn.setAttribute('disabled', 'disabled');
	btn.style.cursor = 'wait';
	btn.innerHTML = 'Working...';
}

function unfreezeButton(btn) {
	btn.removeAttribute('disabled');
	btn.style.cursor = '';
	btn.innerHTML = 'Steal GPX';
}

function installButton() {
	const kudosButton = document.querySelector('#kudos-comments-container button');
	const h1 = document.querySelector('h1');
	const ul = h1?.parentNode?.parentNode?.querySelector('ul');
	const stealButton = document.createElement('button');
	stealButton.appendChild(document.createTextNode('Steal GPX'));
	stealButton.onclick = stealGpx;
	if (kudosButton) {
		debug('Found kudos button - attaching our button');
		kudosButton.insertAdjacentElement('beforebegin', stealButton);
	} else if (ul) {
		debug('Found ul - attaching our button');
		const li = document.createElement('li');
		li.appendChild(stealButton);
		ul.appendChild(li);
	} else if (h1) {
		debug('Found h1 - attaching our button');
		stealButton.style.alignSelf = 'stretch';
		stealButton.style.margin = '1rem';
		h1.insertAdjacentElement('afterend', stealButton);
	} else {
		debug('Kudos button not found - click extension button to get GPX');
		setTimeout(() => installButton(), 1000);
	}
}

installButton()