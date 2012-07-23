Marine Compass
====================

A fully web standards compliant JavaScript 3D Compass application.

#### Requirements ####

A web browser with the following web standards support:

* WebGL - [When/Where can I use WebGL?](http://caniuse.com/#feat=webgl)
* Device Orientation Events - [When/Where can I use Device Orientation Events?](http://caniuse.com/#feat=deviceorientation)

As of 23-Jul 2012 only [Opera Mobile 12 for Android](https://play.google.com/store/apps/details?id=com.opera.browser&hl=en) has the necessary web standards support required to run this application. You can view the shiny effects in [Google Chrome for Mac](http://www.google.com/mac/) but the lack of a device orientation 'alpha' value means that the compass cannot be calibrated correctly.

Even if this worked in other browsers there is also the issue that each browser maker has [implemented Device Orientation Event data completely differently to each other](http://lists.w3.org/Archives/Public/public-geolocation/2012Jun/0000.html), making it nigh on impossible to make 3-axis orientation-based web applications such as Marine Compass work in all browsers. Hopefully this will change soon. The implementation of Marine Compass is based on the device orientation data returned by Opera Mobile 12, which I consider is the closest to the web standard [as it is currently defined](http://dev.w3.org/geo/api/spec-source-orientation.html).

#### Usage ####

Simply clone this repo as follows:

    git clone git@github.com:richtr/Marine-Compass.git

Load 'index.html' and enjoy!

An online demo is available @ [http://people.opera.com/richt/release/demos/orientation/marinecompass](http://people.opera.com/richt/release/demos/orientation/marinecompass).

#### Screenshots ####

<img src="https://github.com/richtr/Marine-Compass/raw/master/screenshots/marinecompass1.png" width="240"/>

<img src="https://github.com/richtr/Marine-Compass/raw/master/screenshots/marinecompass2.png" width="240"/>

<img src="https://github.com/richtr/Marine-Compass/raw/master/screenshots/marinecompass3.png" width="240"/>
