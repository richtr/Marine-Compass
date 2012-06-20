/*
 * Marine Compass
 * http://github.com/richtr/Marine-Compass
 *
 * Copyright (c) 2012, Rich Tibbett
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
  * Based on sample code from the Marine Compass for Android project:
  *
  * Author:    Pierre Hébert
  * License:   Apache License, Version 2.0 (see LICENSE file)
  * URLs:      http://www.pierrox.net/cmsms/applications/marine-compass.html
  */

!(function(window, undefined) {

    var document = window.document;

    function toRad(val) {
        return val * Math.PI / 180;
    }
    function toDeg(val) {
        return val * 180 / Math.PI;
    }

    var compassVertexSource = [
    "attribute vec3 aNormalPosition;",
    "attribute vec3 aVertexPosition;",
    "attribute vec2 aTextureCoord;",
    "",
    "uniform vec3 lightDir;",
    "",
    "uniform mat4 uMVMatrix;",
    "uniform mat4 uPMatrix;",
    "uniform mat4 uNMatrix;",
    "",
    "varying float v_Dot;",
    "",
    "varying mediump vec2 vTextureCoord;",
    "",
    "void main(void) {",
    "  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);",
    "  vTextureCoord = aTextureCoord;",
    "    vec4 transNormal = uNMatrix * vec4(aNormalPosition, 1);",
    "    v_Dot = max(dot(transNormal.xyz, lightDir), 0.0);",
    "}"
    ].join("\n");

    var compassFragmentSource = [
    "precision mediump float;",
    "",
    "varying mediump vec2 vTextureCoord;",
    "",
    "uniform sampler2D uSampler;",
    "",
    "varying float v_Dot;",
    "",
    "void main(void) {",
    /*"    vec2 texCoord = vec2(vTextureCoord.s, vTextureCoord.t);",
    "    vec4 color = texture2D(uSampler, texCoord);",
    "    color += vec4(0.1, 0.1, 0.1, 1);",
    "    gl_FragColor = texture2D(uSampler, vec2(color.xyz * v_Dot, color.a));",*/
    "  gl_FragColor = texture2D(uSampler, vec2(vTextureCoord.s, vTextureCoord.t));",
    "}"
    ].join("\n");

    // +++ COMPASS +++
    window.Compass = function(canvasElement) {

        if (!canvasElement) {
            canvasElement = document.createElement('canvas');
            canvasElement.setAttribute('width', window.innerWidth);
            canvasElement.setAttribute('height', window.innerHeight);
            document.body.appendChild(canvasElement);
        }

        this.canvasElement = canvasElement;

        try {
            this.gl = WebGLUtils.setupWebGL(canvasElement);
            this.gl.viewportWidth = canvasElement.getAttribute('width');
            this.gl.viewportHeight = canvasElement.getAttribute('height');
        }
        catch(e) {}

        if (!this.gl) return;

        this.init();

        this.render();

    };

    window.Compass.prototype = {

        constructor: window.Compass,

        init: function() {

            var self = this;

            // Catch window resize event
            window.addEventListener('resize', function() {

                // Adjust the width and height
                self.canvasElement.setAttribute('width', window.innerWidth);
                self.canvasElement.setAttribute('height', window.innerHeight);

                self.gl.viewportWidth = self.canvasElement.getAttribute('width');
                self.gl.viewportHeight = self.canvasElement.getAttribute('height');

                // Rescale webgl viewport
                self.gl.viewport(0, 0, self.gl.viewportWidth, self.gl.viewportHeight);

            },
            true);

            // CompassRenderer manages 3D objects and gl surface life cycle
            this.mCompassRenderer = new CompassRenderer(this);

            function createRingMAngles() {
                var _mAngles = new Array(3);
                for(var i = 0, l = _mAngles.length; i < l; i++) {
                  _mAngles[i] = new Array(2);
                  for(var j = 0, m = _mAngles[i].length; j < m; j++) {
                    _mAngles[i][j] = 0;
                  }
                }
                return _mAngles;
            }

            // Initialize a ring buffer for the orientation values
            this.RING_BUFFER_SIZE = 10;
            this.mNumAngles = 0;
            this.mRingBufferIndex = 0;
            this.mAnglesRingBuffer = new Array(this.RING_BUFFER_SIZE);
            for(var i = 0, l = this.mAnglesRingBuffer.length; i < l; i++) {
                this.mAnglesRingBuffer[i] = createRingMAngles();
            }
            this.mAngles = createRingMAngles();

            this.lastOrientEvent = null;

            // Start orientation listener
            /*if(!window.ondeviceorientation) {
                var container = this.canvasElement.parentNode;
                if (container) {
                    container.innerHTML = makeFailHTML('' +
                      'This page requires a browser that supports Device Orientation Events.<br/>' +
                      '<a href="http://caniuse.com/#feat=deviceorientation">Click here to check support by browser.</a>'
                    );
                }
            } else {*/
                window.addEventListener('deviceorientation', function(oEvent) {

                    // Simply store event result and we'll read from it at the
                    // next request animation frame.
                    self.lastOrientEvent = {
                        alpha: oEvent.alpha || 0,
                        beta: oEvent.beta || 0,
                        gamma: oEvent.gamma || 0
                    };

                },
                true);
            //}
            //this.gl.clearColor(0.3, 0.3, 0.3, 0);
            this.gl.clearDepth(500);

            this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);

        },

        output: function(str) {
            document.body.appendChild(document.createTextNode(str));
            document.body.appendChild(document.createElement("br"));
        },

        checkGLError: function() {
            var error = this.gl.getError();
            if (error != this.gl.NO_ERROR && error != this.gl.CONTEXT_LOST_WEBGL) {
                var str = "GL Error: " + error;
                this.output(str);
                throw str;
            }
        },

        calculateOrientation: function() {

            if(this.lastOrientEvent === null) return;

            if(this.mNumAngles==this.RING_BUFFER_SIZE) {
              // subtract oldest vector
              this.mAngles[0][0] -= this.mAnglesRingBuffer[this.mRingBufferIndex][0][0];
              this.mAngles[0][1] -= this.mAnglesRingBuffer[this.mRingBufferIndex][0][1];
              this.mAngles[1][0] -= this.mAnglesRingBuffer[this.mRingBufferIndex][1][0];
              this.mAngles[1][1] -= this.mAnglesRingBuffer[this.mRingBufferIndex][1][1];
              this.mAngles[2][0] -= this.mAnglesRingBuffer[this.mRingBufferIndex][2][0];
              this.mAngles[2][1] -= this.mAnglesRingBuffer[this.mRingBufferIndex][2][1];
        } else {
          this.mNumAngles++;
        }

        // convert event inputs to radians
        var alpha = toRad(this.lastOrientEvent.alpha);
        var beta  = toRad(this.lastOrientEvent.beta);
        var gamma = toRad(this.lastOrientEvent.gamma);

        // convert angles into x/y
        this.mAnglesRingBuffer[this.mRingBufferIndex][0][0] = Math.cos(alpha);
        this.mAnglesRingBuffer[this.mRingBufferIndex][0][1] = Math.sin(alpha);
        this.mAnglesRingBuffer[this.mRingBufferIndex][1][0] = Math.cos(beta);
        this.mAnglesRingBuffer[this.mRingBufferIndex][1][1] = Math.sin(beta);
        this.mAnglesRingBuffer[this.mRingBufferIndex][2][0] = Math.cos(gamma);
        this.mAnglesRingBuffer[this.mRingBufferIndex][2][1] = Math.sin(gamma);

        // accumulate new x/y vector
        this.mAngles[0][0] += this.mAnglesRingBuffer[this.mRingBufferIndex][0][0];
        this.mAngles[0][1] += this.mAnglesRingBuffer[this.mRingBufferIndex][0][1];
        this.mAngles[1][0] += this.mAnglesRingBuffer[this.mRingBufferIndex][1][0];
        this.mAngles[1][1] += this.mAnglesRingBuffer[this.mRingBufferIndex][1][1];
        this.mAngles[2][0] += this.mAnglesRingBuffer[this.mRingBufferIndex][2][0];
        this.mAngles[2][1] += this.mAnglesRingBuffer[this.mRingBufferIndex][2][1];

        this.mRingBufferIndex++;
        if(this.mRingBufferIndex == this.RING_BUFFER_SIZE) {
          this.mRingBufferIndex=0;
        }

        // convert back x/y into angles
        var azimuth = toDeg(Math.atan2(this.mAngles[0][1], this.mAngles[0][0]));
        var pitch   = toDeg(Math.atan2(this.mAngles[1][1], this.mAngles[1][0]));
        var roll    = toDeg(Math.atan2(this.mAngles[2][1], this.mAngles[2][0]));

        this.mCompassRenderer.setOrientation(azimuth, pitch, roll);

        // set text heading
        /* if(azimuth < 0) azimuth = (360 + azimuth) % 360;
           this.mHeadingView.setText("Heading: " + azimuth + "&degrees;"); */

        },

        render: function() {

            // Update orientation buffer
            this.calculateOrientation();

            // Draw frame
            this.mCompassRenderer.draw();

            // Re-render at next key frame
            // see: http://stackoverflow.com/questions/6065169/requestanimationframe-with-this-keyword
            window.requestAnimFrame(this.render.bind(this));
        }

    };

    // +++ COMPASSRENDERER +++
    var CompassRenderer = function(compass) {

        this.compass = compass;
        this.gl = this.compass.gl;

        this.pMatrix = new Matrix4x4();
        this.mvMatrix = new Matrix4x4();
        this.nMatrix = new Matrix4x4();
        this.init();

        this.mTurntable = new Turntable(this);

    };

    CompassRenderer.prototype = {
        constructor: CompassRenderer,

        loadShader: function(type, shaderSrc) {
            var shader = this.gl.createShader(type);
            // Load the shader source
            this.gl.shaderSource(shader, shaderSrc);
            // Compile the shader
            this.gl.compileShader(shader);
            // Check the compile status
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS) &&
            !this.gl.isContextLost()) {
                var infoLog = this.gl.getShaderInfoLog(shader);
                console.error("Error compiling shader:\n" + infoLog);
                this.gl.deleteShader(shader);
                return null;
            }
            return shader;
        },

        init: function() {
            this.setOrientation(0, 0, 0);
            // initialize
            var vertexShader = this.loadShader(this.gl.VERTEX_SHADER, compassVertexSource);
            var fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, compassFragmentSource);

            this.shaderProgram = this.gl.createProgram();
            this.gl.attachShader(this.shaderProgram, vertexShader);
            this.gl.attachShader(this.shaderProgram, fragmentShader);

            this.gl.bindAttribLocation(this.shaderProgram, 0, "aNormal");
            this.gl.bindAttribLocation(this.shaderProgram, 1, "aTextureCoord");
            this.gl.bindAttribLocation(this.shaderProgram, 2, "aVertexPosition");

            this.gl.enableVertexAttribArray(0);
            // NORMAL
            this.gl.enableVertexAttribArray(1);
            // TEXCOORD
            this.gl.enableVertexAttribArray(2);
            // VERTEX
            this.gl.linkProgram(this.shaderProgram);

            // Check the link status
            var linked = this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS);
            if (!linked && !this.gl.isContextLost()) {
                var infoLog = this.gl.getProgramInfoLog(this.shaderProgram);
                this.compass.output("Error linking program:\n" + infoLog);
                this.gl.deleteProgram(this.shaderProgram);
                return;
            }

            this.gl.useProgram(this.shaderProgram);

            this.gl.enable(this.gl.DEPTH_TEST);

            // Set some uniform variables for the shaders
            this.shaderProgram.mvMatrixUniform = this.gl.getUniformLocation(this.shaderProgram, "uMVMatrix");
            this.shaderProgram.nMatrixUniform = this.gl.getUniformLocation(this.shaderProgram, "uNMatrix");

            this.shaderProgram.shaderUniform = this.gl.getUniformLocation(this.shaderProgram, "uSampler");

            /* TODO: move this out to only be calculuated on init + any resize */
            this.pMatrix.loadIdentity();
            this.pMatrix.perspective(45, this.gl.viewportWidth / this.gl.viewportHeight, 0.1, 100);
            this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.shaderProgram, "uPMatrix"), false, this.pMatrix.elements);

        },

        setMatrixUniforms: function() {
            this.gl.uniformMatrix4fv(this.shaderProgram.mvMatrixUniform, false, this.mvMatrix.elements);
            this.gl.uniformMatrix4fv(this.shaderProgram.nMatrixUniform, false, this.nMatrix.elements);
        },

        setOrientation: function(azimuth, pitch, roll) {
            this.azimuth = azimuth;
            this.pitch = pitch;
            this.roll = roll;
        },

        draw: function() {

            // Clear the canvas
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

            //this.gl.colorMask(1, 1, 1, 0);

            // Make a model/view matrix.
            this.mvMatrix.loadIdentity();
            this.mvMatrix.translate(0.0, 0.0, -4.0);
            this.mvMatrix.rotate(this.pitch - 90, 1, 0, 0);
            this.mvMatrix.rotate( - this.roll, 0, 0, 1);
            this.mvMatrix.rotate(this.azimuth - 180, 0, 1, 0);
            this.mvMatrix.translate(0.0, 0.7, 0.0);

            // Construct the normal matrix from the model-view matrix
            this.nMatrix = this.mvMatrix.copy();
            this.nMatrix.invert();
            this.nMatrix.transpose();

            this.setMatrixUniforms();

            // ***
            this.mTurntable.draw();

        }

    };

    // +++ TURNTABLE +++
    var Turntable = function(compassrenderer) {

        this.compassrenderer = compassrenderer;
        this.gl = this.compassrenderer.compass.gl;

        this.DETAIL_X = [15, 25, 30];
        this.DETAIL_Y = [3, 6, 6];
        this.RING_HEIGHT = [2, 3, 3];

        this.TEXTURE_RING = 0;
        this.TEXTURE_DIAL = 1;

        this.CARDINAL_POINTS = ["N", "W", "S", "E"];

        this.mDetailsLevel = 1;
        this.mReversedRing = true;

        this.mNeedObjectsUpdate = true;
        this.mNeedTextureUpdate = true;

    };

    Turntable.prototype = {
        constructor: Turntable,

        buildObjects: function() {
            this.buildRingObject();
            this.buildCapObject();
            this.buildDialObject();

            this.mNeedObjectsUpdate = false;
        },

        buildRingObject: function() {

            // build vertices
            var dx = this.DETAIL_X[this.mDetailsLevel];
            var dy = this.DETAIL_Y[this.mDetailsLevel];
            var rh = this.RING_HEIGHT[this.mDetailsLevel];

            var vertices = new Array(((dx + 1) * (rh + 1)) * 3);
            var normals = new Array(((dx + 1) * (rh + 1)) * 3);

            var n = 0;

            for (var i = 0; i <= dx; i++) {
                for (var j = 0; j <= rh; j++) {
                    var a = i * (Math.PI * 2) / dx;
                    var b = j * Math.PI / (dy * 2);

                    var x = Math.sin(a) * Math.cos(b);
                    var y = -Math.sin(b);
                    var z = Math.cos(a) * Math.cos(b);

                    vertices[n] = x;
                    vertices[n + 1] = y;
                    vertices[n + 2] = z;
                    normals[n] = vertices[n];
                    normals[n + 1] = vertices[n + 1];
                    normals[n + 2] = vertices[n + 2];

                    n += 3;
                }
            }

            // build textures coordinates
            var texCoords = new Array((dx + 1) * (rh + 1) * 2);
            n = 0;
            for (var i = 0; i <= dx; i++) {
                for (var j = 0; j <= rh; j++) {
                    texCoords[n++] = i / dx;
                    texCoords[n++] = j / rh;
                }
            }

            // build indices
            var indices = new Array(dx * rh * 3 * 2);
            n = 0;
            for (var i = 0; i < dx; i++) {
                for (var j = 0; j < rh; j++) {
                    var p0 = ((rh + 1) * i + j);
                    indices[n++] = p0;
                    indices[n++] = (p0 + rh + 1);
                    indices[n++] = (p0 + 1);

                    indices[n++] = (p0 + rh + 1);
                    indices[n++] = (p0 + rh + 2);
                    indices[n++] = (p0 + 1);
                }
            }

            // Bind buffers to WebGL renderer
            this.mRingVertexBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingVertexBufferGL);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
            this.mRingVertexBufferGL.itemSize = 3;
            this.mRingVertexBufferGL.numItems = vertices.length / 3;

            this.mRingNormalBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingNormalBufferGL);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(normals), this.gl.STATIC_DRAW);
            this.mRingNormalBufferGL.itemSize = 3;
            this.mRingNormalBufferGL.numItems = normals.length / 3;

            this.mRingTexCoordBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingTexCoordBufferGL);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(texCoords), this.gl.STATIC_DRAW);
            this.mRingTexCoordBufferGL.itemSize = 2;
            this.mRingTexCoordBufferGL.numItems = texCoords.length / 2;

            this.mRingIndexBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mRingIndexBufferGL);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STREAM_DRAW);
            this.mRingIndexBufferGL.itemSize = 1;
            this.mRingIndexBufferGL.numItems = indices.length;

        },

        buildCapObject: function() {

            var dx = this.DETAIL_X[this.mDetailsLevel];
            var dy = this.DETAIL_Y[this.mDetailsLevel];
            var rh = this.RING_HEIGHT[this.mDetailsLevel];

            var h = dy - rh;

            // build vertices
            var vertices = new Array(((dx + 1) * (h + 1)) * 3);

            var n = 0;
            for (var i = 0; i <= dx; i++) {
                for (var j = rh; j <= dy; j++) {
                    var a = i * (Math.PI * 2) / dx;
                    var b = j * Math.PI / (dy * 2);

                    var x = Math.sin(a) * Math.cos(b);
                    var y = -Math.sin(b);
                    var z = Math.cos(a) * Math.cos(b);

                    vertices[n++] = x;
                    vertices[n++] = y;
                    vertices[n++] = z;
                }
            }

            // build indices
            var indices = new Array(dx * h * 3 * 2);
            n = 0;
            for (var i = 0; i < dx; i++) {
                for (var j = 0; j < h; j++) {
                    var p0 = ((h + 1) * i + j);
                    indices[n++] = p0;
                    indices[n++] = (p0 + h + 1);
                    indices[n++] = (p0 + 1);

                    indices[n++] = (p0 + h + 1);
                    indices[n++] = (p0 + h + 2);
                    indices[n++] = (p0 + 1);
                }
            }

            this.mCapVertexBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mCapVertexBufferGL);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
            this.mCapVertexBufferGL.itemSize = 3;
            this.mCapVertexBufferGL.numItems = vertices.length / 3;

            this.mCapIndexBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mCapIndexBufferGL);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STREAM_DRAW);
            this.mCapIndexBufferGL.itemSize = 1;
            this.mCapIndexBufferGL.numItems = indices.length;

        },

        buildDialObject: function() {

            var dx = this.DETAIL_X[this.mDetailsLevel];

            var vertices = new Array((dx + 2) * 3);
            var normals = new Array((dx + 2) * 3);

            var n = 0;
            // center of the dial
            vertices[n] = 0;
            vertices[n + 1] = 0;
            vertices[n + 2] = 0;
            normals[n] = 0;
            normals[n + 1] = 1;
            normals[n + 2] = 0;
            n += 3;
            for (var i = 0; i <= dx; i++) {
                var a = i * (Math.PI * 2) / dx;

                var x = Math.sin(a);
                var z = Math.cos(a);

                vertices[n] = x;
                vertices[n + 1] = 0;
                vertices[n + 2] = z;
                normals[n] = 0;
                normals[n + 1] = 1;
                normals[n + 2] = 0;
                n += 3;
            }

            // build textures coordinates
            var texCoords = new Array((dx + 2) * 2);
            n = 0;
            texCoords[n++] = 0.5;
            texCoords[n++] = 0.5;
            for (var i = 0; i <= dx; i++) {
                var a = i * (Math.PI * 2) / dx;

                var x = (Math.sin(a) + 1) / 2;
                var z = (Math.cos(a) + 1) / 2;

                texCoords[n++] = x;
                texCoords[n++] = z;
            }

            // build indices
            var indices = new Array(dx + 2);
            n = 0;
            for (var i = 0; i <= (dx + 1); i++) {
                indices[n++] = i;
            }

            this.mDialVertexBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialVertexBufferGL);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
            this.mDialVertexBufferGL.itemSize = 3;
            this.mDialVertexBufferGL.numItems = vertices.length / 3;

            this.mDialNormalBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialNormalBufferGL);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(normals), this.gl.STATIC_DRAW);
            this.mDialNormalBufferGL.itemSize = 3;
            this.mDialNormalBufferGL.numItems = normals.length / 3;

            this.mDialTexCoordBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialTexCoordBufferGL);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(texCoords), this.gl.STATIC_DRAW);
            this.mDialTexCoordBufferGL.itemSize = 2;
            this.mDialTexCoordBufferGL.numItems = texCoords.length / 2;

            this.mDialIndexBufferGL = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mDialIndexBufferGL);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), this.gl.STREAM_DRAW);
            this.mDialIndexBufferGL.itemSize = 1;
            this.mDialIndexBufferGL.numItems = indices.length;
        },

        buildTextures: function() {
            this.mTextures = new Array(2);

            this.mTextures[this.TEXTURE_RING] = this.gl.createTexture();
            this.mTextures[this.TEXTURE_DIAL] = this.gl.createTexture();

            this.buildRingTexture();
            this.buildDialTexture();

            this.mNeedTextureUpdate = false;
        },

        buildRingTexture: function() {

            var length = 512;
            var height = 64;

            var canvas = document.createElement('canvas');
            canvas.setAttribute('width', length);
            canvas.setAttribute('height', height);
            //document.body.appendChild(canvas); // debugging
            var context = canvas.getContext('2d');

            context.fillStyle = '#000000';
            context.fillRect(0, 0, length, height);

            // draw medium graduations in white
            context.strokeStyle = '#fff';
            context.lineWidth = 1;

            for (var d = 0; d < 360; d += 10) {
                var pos = d * length / 360;

                context.beginPath();
                context.moveTo(pos, 0);
                context.lineTo(pos, 20);
                context.closePath();

                context.stroke();
            }


            // draw major graduations in red
            context.strokeStyle = '#FF0000';
            context.lineWidth = 2;

            for (var d = 0; d < 360; d += 90) {
                var pos = d * length / 360;

                context.beginPath();
                context.moveTo(pos, 0);
                context.lineTo(pos, 30);
                context.closePath();

                context.stroke();
            }

            context.textAlign = "center";

            // draw minor graduations text
            context.font = 'bold 9px sans-serif';

            context.fillStyle = '#fff';
            context.textAlign = 'center';

            for (var d = 0; d < 360; d += 30) {
                // do not draw 0/90/180/270
                var pos = d * length / 360;
                var angle = this.mReversedRing ? (360 + 180 - d) % 360: 360 - d;
                if (d % 90 != 0) context.fillText(angle, pos, 30);
            }

            // draw N/O/S/E
            // hack : go till 360, so that "N" is printed at both end of the texture...
            context.font = 'bold 20px sans-serif';

            context.fillStyle = '#fff';
            context.textAlign = 'center';

            for (var d = 0; d <= 360; d += 90) {
                var pos = d * length / 360;
                if (this.mReversedRing) {
                    context.fillText(this.CARDINAL_POINTS[((d + 180) / 90) % 4], pos, 50);
                } else {
                    context.fillText(this.CARDINAL_POINTS[(d / 90) % 4], pos, 50);
                }
            }

            var gradient = context.createLinearGradient(0, 5, 0, 0);
            gradient.addColorStop(0.5, "#FF0000");
            gradient.addColorStop(0.5, "#FFF");
            context.fillStyle = gradient;

            context.fillRect(0, 0, length, 5);

            // ***
            var image = document.createElement('img');
            var self = this;
            image.onload = function() {
                //self.gl.activeTexture(self.gl.TEXTURE0);

                self.gl.bindTexture(self.gl.TEXTURE_2D, self.mTextures[self.TEXTURE_RING]);

                self.gl.pixelStorei(self.gl.UNPACK_ALIGNMENT, 1);

                //self.gl.uniform1i(self.compassrenderer.shaderProgram.shaderUniform, 0);

                self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, self.gl.RGBA, self.gl.UNSIGNED_BYTE, image);

                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MAG_FILTER, self.gl.LINEAR);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.LINEAR);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_S, self.gl.CLAMP_TO_EDGE);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_T, self.gl.CLAMP_TO_EDGE);

                self.gl.bindTexture(self.gl.TEXTURE_2D, null);

                self.compassrenderer.compass.checkGLError();

            };
            image.src = canvas.toDataURL();

        },

        buildDialTexture: function() {

            var radius = 256;

            var canvas = document.createElement('canvas');
            canvas.setAttribute('width', radius * 2);
            canvas.setAttribute('height', radius * 2);
            //document.body.appendChild(canvas); // debugging
            var context = canvas.getContext('2d');

            context.fillStyle = '#000000';
            context.fillRect(0, 0, radius * 2, radius * 2);

            // outer shaded ring
            context.strokeStyle = '#666';
            //context.fillStyle = '#000';
            context.lineWidth = 4;

            context.beginPath();
            context.arc(radius, radius, radius - 10, 0, Math.PI * 2);
            context.stroke();
            //context.fill();
            context.closePath();

            // build the inner decoration, using two symmetrical paths
            context.save();
            for (var i = 0; i < 4; i++) {

                context.translate(radius, radius);
                context.rotate(i * Math.PI / 2);
                context.translate( - radius, -radius);

                context.fillStyle = '#666';
                context.beginPath();
                context.moveTo(radius, radius / 2);
                context.lineTo(radius + 20, radius - 20);
                context.lineTo(radius, radius);
                context.closePath();
                context.fill();

                context.fillStyle = '#FFFFFF';
                context.beginPath();
                context.moveTo(radius, radius / 2);
                context.lineTo(radius - 20, radius - 20);
                context.lineTo(radius, radius);
                context.closePath();
                context.fill();

            }
            context.restore();

            // draw medium graduations in white
            context.strokeStyle = '#FFFFFF';
            context.lineWidth = 2;
            for (var i = 0; i < 360; i += 10) {
                context.save();
                context.translate(radius, radius);
                context.rotate(i * Math.PI / 180);
                context.translate( - radius, -radius);
                context.beginPath();
                context.moveTo(radius, radius * 2);
                context.lineTo(radius, 1.75 * radius);
                context.stroke();
                //context.closePath();
                context.restore();
            }

            // draw major graduations in red
            context.strokeStyle = '#FF0000';
            context.lineWidth = 3;
            for (var i = 0; i < 360; i += 90) {
                context.save();
                context.translate(radius, radius);
                context.rotate(i * Math.PI / 180);
                context.translate( - radius, -radius);
                context.beginPath();
                context.moveTo(radius, radius * 2);
                context.lineTo(radius, 1.70 * radius);
                context.stroke();
                //context.closePath();
                context.restore();
            }

            // medium graduation texts
            context.font = 'bold 24px sans-serif';
            context.fillStyle = '#fff';
            context.textAlign = 'center';
            for (var i = 0; i < 360; i += 30) {
                if ((i % 90) != 0) {
                    var a = -i * (Math.PI * 2) / 360;
                    var x = Math.sin(a) * 0.7 * radius + radius;
                    var y = Math.cos(a) * 0.7 * radius + radius;

                    context.save();
                    context.translate(x, y);
                    context.rotate(i * Math.PI / 180);
                    context.translate( - x, -y);

                    context.fillText(i, x, y);

                    context.restore();
                }
            }

            // draw N/O/S/E
            context.font = 'bold 38px sans-serif';
            context.fillStyle = '#FF0000';
            context.textAlign = 'center';
            for (var i = 0; i < 360; i += 90) {
                var a = i * (Math.PI * 2) / 360;
                var x = Math.sin(a) * 0.65 * radius + radius;
                var y = Math.cos(a) * 0.65 * radius + radius;

                context.save();
                context.translate(x, y);
                context.rotate( - i * Math.PI / 180);
                context.translate( - x, -y);

                context.fillText(this.CARDINAL_POINTS[i / 90], x, y);

                context.restore();
            }

            // ***
            var image = document.createElement('img');
            var self = this;
            image.onload = function() {

                //self.gl.activeTexture(self.gl.TEXTURE1);

                self.gl.bindTexture(self.gl.TEXTURE_2D, self.mTextures[self.TEXTURE_DIAL]);

                self.gl.pixelStorei(self.gl.UNPACK_ALIGNMENT, 1);

                //self.gl.uniform1i(self.compassrenderer.shaderProgram.shaderUniform, 1);

                self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, self.gl.RGBA, self.gl.UNSIGNED_BYTE, image);

                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MAG_FILTER, self.gl.LINEAR);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.LINEAR);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_S, self.gl.CLAMP_TO_EDGE);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_T, self.gl.CLAMP_TO_EDGE);

                self.gl.bindTexture(self.gl.TEXTURE_2D, null);

                self.compassrenderer.compass.checkGLError();

            };
            image.src = canvas.toDataURL();

        },

        draw: function() {

            // rebuild objects or textures if needed
            if (this.mNeedObjectsUpdate) {
                this.buildObjects();
            }

            if (this.mNeedTextureUpdate) {
                this.buildTextures();
            }

            var dx = this.DETAIL_X[this.mDetailsLevel];
            var dy = this.DETAIL_Y[this.mDetailsLevel];
            var rh = this.RING_HEIGHT[this.mDetailsLevel];

            this.gl.enableVertexAttribArray(0);
            this.gl.enableVertexAttribArray(1);

            // Draw Ring Object

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingVertexBufferGL);
            this.gl.vertexAttribPointer(2, this.mRingVertexBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingNormalBufferGL);
            this.gl.vertexAttribPointer(0, this.mRingNormalBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingTexCoordBufferGL);
            this.gl.vertexAttribPointer(1, this.mRingTexCoordBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            //this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.mTextures[this.TEXTURE_RING]);
            //this.gl.uniform1i(this.compassrenderer.shaderProgram.shaderUniform, 0);

            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mRingIndexBufferGL);

            this.gl.drawElements(this.gl.TRIANGLES, dx * rh * 6, this.gl.UNSIGNED_SHORT, 0);

            // Draw Dial Object

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialVertexBufferGL);
            this.gl.vertexAttribPointer(2, this.mDialVertexBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialNormalBufferGL);
            this.gl.vertexAttribPointer(0, this.mDialNormalBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialTexCoordBufferGL);
            this.gl.vertexAttribPointer(1, this.mDialTexCoordBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            //this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.mTextures[this.TEXTURE_DIAL]);
            //this.gl.uniform1i(this.compassrenderer.shaderProgram.shaderUniform, 1);

            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mDialIndexBufferGL);

            this.gl.drawElements(this.gl.TRIANGLE_FAN, dx + 2, this.gl.UNSIGNED_SHORT, 0);

            // Draw Cap Object
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mCapVertexBufferGL);
            this.gl.vertexAttribPointer(2, this.mCapVertexBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.disableVertexAttribArray(0);
            this.gl.disableVertexAttribArray(1);

            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mCapIndexBufferGL);

            this.gl.bindTexture(this.gl.TEXTURE_2D, null);

            this.gl.drawElements(this.gl.TRIANGLES, dx * (dy - rh) * 6, this.gl.UNSIGNED_SHORT, 0);

            this.compassrenderer.compass.checkGLError();

        }

    };

})(window);