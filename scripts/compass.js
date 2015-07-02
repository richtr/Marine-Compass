/*
 * Marine Compass
 * http://github.com/richtr/Marine-Compass
 *
 * Copyright (c) 2012-2014, Rich Tibbett
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

    function isPowerOf2(value) {
      return (value & (value - 1)) == 0;
    };

    var HALF_PI = Math.PI / 2,
        TWO_PI = Math.PI * 2;

    var compassVertexSource = [
    "attribute vec3 aVertexPosition;",
    "attribute vec2 aTextureCoord;",
    "",
    "uniform mat4 uMVMatrix;",
    "uniform mat4 uPMatrix;",
    "",
    "varying mediump vec2 vTextureCoord;",
    "",
    "void main(void) {",
    "  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);",
    "  vTextureCoord = aTextureCoord;",
    "}"
    ].join("\n");

    var compassFragmentSource = [
    "precision mediump float;",
    "",
    "varying vec2 vTextureCoord;",
    "",
    "uniform sampler2D uSampler;",
    "",
    "void main(void) {",
    "  vec4 textureColor = texture2D(uSampler, vTextureCoord);",
    "  gl_FragColor = textureColor;",
    "}"
    ].join("\n");

    var create3DContext = function(canvas, opt_attribs) {
      var names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
      var context = null;
      for (var ii = 0; ii < names.length; ii++) {
        try {
          context = canvas.getContext(names[ii], opt_attribs);
        } catch(e) {}
        if (context) {
          break;
        }
      }
      return context;
    };

    // +++ COMPASS +++
    window.Compass = function(canvasElement, headingElement) {

        if (!canvasElement) {
            canvasElement = document.createElement('canvas');
            canvasElement.setAttribute('width', window.innerWidth);
            canvasElement.setAttribute('height', window.innerHeight);
            document.body.appendChild(canvasElement);
        }

        this.canvasElement = canvasElement;
        this.headingElement = headingElement || document.createElement('div');

        try {
            this.gl = create3DContext(canvasElement);

            if(!this.gl) {

              this.output('Unable to initialize WebGL. Your browser may not support it', 'http://get.webgl.org');

            } else {

              this.gl.viewportWidth = canvasElement.getAttribute('width');
              this.gl.viewportHeight = canvasElement.getAttribute('height');

              this.init();

              this.render();

            }

        }
        catch(e) {

          this.output('Unable to initialize WebGL. Your browser may not support it', 'http://get.webgl.org');

        }

    };

    window.Compass.prototype = {

        constructor: window.Compass,

        init: function() {

            var self = this;

            // Set up *compass* deviceorientation data capture via Full Tilt JS
            self.orientationData = new FULLTILT.DeviceOrientation({'type': 'world'});
            self.orientationData.start();

            // Create rotation matrix object (calculated per canvas draw)
            this.rotationMatrix = mat4.create();
            mat4.identity(this.rotationMatrix);

            // Create screen transform matrix (calculated once)
            this.screenMatrix = mat4.create();
            mat4.identity(this.screenMatrix);

            var inv = toRad(180);

            this.screenMatrix[0] =   Math.cos( inv );
            this.screenMatrix[1] =   Math.sin( inv );
            this.screenMatrix[4] = - Math.sin( inv );
            this.screenMatrix[5] =   Math.cos( inv );

            // Create world transformation matrix (calculated once)
            this.worldMatrix = mat4.create();
            mat4.identity(this.worldMatrix);

            var up = toRad(90);

            this.worldMatrix[5]  =   Math.cos( up );
            this.worldMatrix[6]  =   Math.sin( up );
            this.worldMatrix[9]  = - Math.sin( up );
            this.worldMatrix[10] =   Math.cos( up );

            // CompassRenderer manages 3D objects and gl surface life cycle
            this.mCompassRenderer = new CompassRenderer(this);

            // Catch window resize event
            window.addEventListener('orientationchange', function() {

              window.setTimeout(function() {

                self.gl.viewportWidth = self.canvasElement.width = window.innerWidth;
                self.gl.viewportHeight = self.canvasElement.height = window.innerHeight;

                // Rescale webgl viewport
                self.gl.viewport(0, 0, self.gl.viewportWidth, self.gl.viewportHeight);

                // Recalculate perspective

                mat4.identity(self.mCompassRenderer.pMatrix);
                mat4.perspective(45, self.gl.viewportWidth / self.gl.viewportHeight, 1, 100, self.mCompassRenderer.pMatrix);
                self.gl.uniformMatrix4fv(
                self.gl.getUniformLocation(self.mCompassRenderer.shaderProgram, "uPMatrix"),
                false, self.mCompassRenderer.pMatrix
                );

              }, 200);

            }, true);

            this.gl.clearDepth(500);

            this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);

        },

        output: function(str, link) {
          // Display error to developer
          console.error(str);

          // Display error to user
          var outputContainer = document.createElement('div');
          outputContainer.setAttribute('class', 'output_err');
          outputContainer.appendChild(document.createTextNode(str + ". "));

          if(link) {
            var output_link = document.createElement('a');
            output_link.href = link;
            output_link.textContent = link;
            outputContainer.appendChild(output_link);
          }

          document.body.appendChild(outputContainer);
        },

        checkGLError: function() {
            var error = this.gl.getError();
            if (error != this.gl.NO_ERROR && error != this.gl.CONTEXT_LOST_WEBGL) {
                var str = "GL Error: " + error;
                this.output(str);
                throw str;
            }
        },

    	calculateRotationMatrix: function() {

            if(!this.orientationData) return;

            // Pull the latest deviceorientation rotation matrix from Full Tilt JS
            var orientationMatrix = this.orientationData.getScreenAdjustedMatrix();

            // Copy 3x3 FULLTILT.RotationMatrix values to 4x4 gl-matrix mat4
            this.rotationMatrix[0] = orientationMatrix.elements[0];
            this.rotationMatrix[1] = orientationMatrix.elements[1];
            this.rotationMatrix[2] = orientationMatrix.elements[2];
            this.rotationMatrix[4] = orientationMatrix.elements[3];
            this.rotationMatrix[5] = orientationMatrix.elements[4];
            this.rotationMatrix[6] = orientationMatrix.elements[5];
            this.rotationMatrix[8] = orientationMatrix.elements[6];
            this.rotationMatrix[9] = orientationMatrix.elements[7];
            this.rotationMatrix[10] = orientationMatrix.elements[8];

            // Invert compass heading
            mat4.multiply(this.rotationMatrix, this.screenMatrix);

            // Apply world orientation (heads-up display)
            mat4.multiply(this.rotationMatrix, this.worldMatrix);

            this.mCompassRenderer.setRotationMatrix(this.rotationMatrix);

            // only show the heading if alpha !== null in used raw data
            var rawOrientationData = this.orientationData.getLastRawEventData();
            if(rawOrientationData.alpha !== undefined && rawOrientationData.alpha !== null) {

                // calculate compass heading pointing out of the back of the screen
                var euler = new FULLTILT.Euler();
                euler.setFromRotationMatrix(orientationMatrix);

                this.mCompassRenderer.setCompassHeading( 360 - euler.alpha );

            }
    	},

        render: function() {

            // Update orientation buffer
            this.calculateRotationMatrix();

            // Draw frame
            this.mCompassRenderer.draw();

            // Re-render at next key frame
            // see: http://stackoverflow.com/questions/6065169/requestanimationframe-with-this-keyword
            window.requestAnimationFrame(this.render.bind(this));
        }

    };

    // +++ COMPASSRENDERER +++
    var CompassRenderer = function(compass) {

        this.compass = compass;
        this.gl = this.compass.gl;

        this.pMatrix = mat4.create();
        this.mvMatrix = mat4.create();
        this.rotationMatrix = mat4.create();

        this.heading = 0;

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
                this.compass.output("Error compiling shader:\n" + infoLog);
                this.gl.deleteShader(shader);
                return null;
            }
            return shader;
        },

        init: function() {
            // initialize
            var vertexShader = this.loadShader(this.gl.VERTEX_SHADER, compassVertexSource);
            var fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, compassFragmentSource);

            this.shaderProgram = this.gl.createProgram();
            this.gl.attachShader(this.shaderProgram, vertexShader);
            this.gl.attachShader(this.shaderProgram, fragmentShader);

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

            this.gl.textureCoordAttribute = this.gl.getAttribLocation(this.shaderProgram, "aTextureCoord");
            this.gl.vertexPositionAttribute = this.gl.getAttribLocation(this.shaderProgram, "aVertexPosition");

            this.gl.enableVertexAttribArray(this.gl.textureCoordAttribute);
            this.gl.enableVertexAttribArray(this.gl.vertexPositionAttribute);

            this.gl.enable(this.gl.DEPTH_TEST);

            // Set some uniform variables for the shaders
            this.shaderProgram.mvMatrixUniform = this.gl.getUniformLocation(this.shaderProgram, "uMVMatrix");
            this.shaderProgram.shaderUniform = this.gl.getUniformLocation(this.shaderProgram, "uSampler");

            // Calculate perspective
            mat4.identity(this.pMatrix);
            mat4.perspective(45, this.gl.viewportWidth / this.gl.viewportHeight, 1, 100, this.pMatrix);
            this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.shaderProgram, "uPMatrix"), false, this.pMatrix);

        },

        setMatrixUniforms: function() {
            this.gl.uniformMatrix4fv(this.shaderProgram.mvMatrixUniform, false, this.mvMatrix);
        },

        setRotationMatrix: function(matrix) {
            this.rotationMatrix = matrix;
        },

        setCompassHeading: function(heading) {
            this.heading = heading < 360 ? heading : heading % 360;
        },

        lastCompassHeading: 0,

        draw: function() {
            // Clear the canvas
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

            // Reset move matrix
            mat4.identity(this.mvMatrix);
            mat4.translate(this.mvMatrix, [ 0, 0, -4 ]);

            // Apply calculated device rotation matrix
            mat4.multiply(this.mvMatrix, this.rotationMatrix);

            this.setMatrixUniforms();

            // Display compass heading
            var thisCompassHeading = Math.floor(this.heading);
            if(this.lastCompassHeading !== thisCompassHeading) {
              this.compass.headingElement.textContent = thisCompassHeading;
              this.lastCompassHeading = thisCompassHeading;
            }

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
                    var a = i * TWO_PI / dx;
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
                    var a = i * TWO_PI / dx;
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
                var a = i * TWO_PI / dx;

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
                var a = i * TWO_PI / dx;

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

            // Initialize textures with empty 1x1 texture while real textures are loaded
            // see: http://stackoverflow.com/a/19748905
            for(var i = 0, l = this.mTextures.length; i < l; i++) {
              this.gl.bindTexture(this.gl.TEXTURE_2D, this.mTextures[i]);
              this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 0, 255])); // initialize as black 1x1 texture
              this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            }

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

                self.mTextures[self.TEXTURE_RING] = self.gl.createTexture();

                self.gl.bindTexture(self.gl.TEXTURE_2D, self.mTextures[self.TEXTURE_RING]);

                self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, self.gl.RGBA, self.gl.UNSIGNED_BYTE, image);

                // see: http://stackoverflow.com/a/19748905
                if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
                  // the dimensions are power of 2 so generate mips and turn on
                  // tri-linear filtering.
                  self.gl.generateMipmap(self.gl.TEXTURE_2D);
                  self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.LINEAR_MIPMAP_LINEAR);
                } else {
                  // at least one of the dimensions is not a power of 2 so set the filtering
                  // so WebGL will render it.
                  self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_S, self.gl.CLAMP_TO_EDGE);
                  self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_T, self.gl.CLAMP_TO_EDGE);
                  self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.LINEAR);
                }

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
            context.arc(radius, radius, radius - 10, 0, TWO_PI);
            context.stroke();
            //context.fill();
            context.closePath();

            // build the inner decoration, using two symmetrical paths
            context.save();
            for (var i = 0; i < 4; i++) {

                context.translate(radius, radius);
                context.rotate(i * HALF_PI);
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
                    var a = -i * TWO_PI / 360;
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
                var a = i * TWO_PI / 360;
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

              self.mTextures[self.TEXTURE_DIAL] = self.gl.createTexture();

              self.gl.bindTexture(self.gl.TEXTURE_2D, self.mTextures[self.TEXTURE_DIAL]);

              self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, self.gl.RGBA, self.gl.UNSIGNED_BYTE, image);

              // see: http://stackoverflow.com/a/19748905
              if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
                // the dimensions are power of 2 so generate mips and turn on
                // tri-linear filtering.
                self.gl.generateMipmap(self.gl.TEXTURE_2D);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.LINEAR_MIPMAP_LINEAR);
              } else {
                // at least one of the dimensions is not a power of 2 so set the filtering
                // so WebGL will render it.
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_S, self.gl.CLAMP_TO_EDGE);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_WRAP_T, self.gl.CLAMP_TO_EDGE);
                self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.LINEAR);
              }

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

            // Enable texture for the ring and dial objects
            this.gl.enableVertexAttribArray(this.gl.textureCoordAttribute);

            // Draw Ring Object
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingVertexBufferGL);
            this.gl.vertexAttribPointer(this.gl.vertexPositionAttribute, this.mRingVertexBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mRingTexCoordBufferGL);
            this.gl.vertexAttribPointer(this.gl.textureCoordAttribute, this.mRingTexCoordBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            //this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.mTextures[this.TEXTURE_RING]);
            //this.gl.uniform1i(this.compassrenderer.shaderProgram.shaderUniform, 0);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mRingIndexBufferGL);

            this.gl.drawElements(this.gl.TRIANGLES, dx * rh * 6, this.gl.UNSIGNED_SHORT, 0);

            // Draw Dial Object
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialVertexBufferGL);
            this.gl.vertexAttribPointer(this.gl.vertexPositionAttribute, this.mDialVertexBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mDialTexCoordBufferGL);
            this.gl.vertexAttribPointer(this.gl.textureCoordAttribute, this.mDialTexCoordBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            //this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.mTextures[this.TEXTURE_DIAL]);
            //this.gl.uniform1i(this.compassrenderer.shaderProgram.shaderUniform, 1);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mDialIndexBufferGL);

            this.gl.drawElements(this.gl.TRIANGLE_FAN, dx + 2, this.gl.UNSIGNED_SHORT, 0);

            // Disable texture for cap object
            this.gl.disableVertexAttribArray(this.gl.textureCoordAttribute);

            // Draw Cap Object
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mCapVertexBufferGL);
            this.gl.vertexAttribPointer(this.gl.vertexPositionAttribute, this.mCapVertexBufferGL.itemSize, this.gl.FLOAT, false, 0, 0);

            this.gl.bindTexture(this.gl.TEXTURE_2D, null);

            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.mCapIndexBufferGL);

            this.gl.drawElements(this.gl.TRIANGLES, dx * (dy - rh) * 6, this.gl.UNSIGNED_SHORT, 0);

            this.compassrenderer.compass.checkGLError();

        }

    };

})(window);
