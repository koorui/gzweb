/**
 * Spawn a model into the scene
 * @constructor
 */
GZ3D.SpawnModel = function(scene, domElement)
{
  this.scene = scene;
  this.domElement = ( domElement !== undefined ) ? domElement : document;
  this.init();
  this.obj = undefined;
  this.callback = undefined;
  this.sdfParser = undefined;

  // Material for simple shapes being spawned (grey transparent)
  this.spawnedShapeMaterial = new THREE.MeshPhongMaterial(
      {color:0xffffff, shading: THREE.SmoothShading} );
  this.spawnedShapeMaterial.transparent = true;
  this.spawnedShapeMaterial.opacity = 0.5;
};

/**
 * Initialize SpawnModel
 */
GZ3D.SpawnModel.prototype.init = function()
{
  this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  this.ray = new THREE.Ray();
  this.obj = null;
  this.active = false;
  this.snapDist = null;
};

/**
 * Start spawning an entity. Only simple shapes supported so far.
 * Adds a temp object to the scene which is not registered on the server.
 * @param {string} entity
 * @param {function} callback
 */
GZ3D.SpawnModel.prototype.start = function(entity, callback)
{
  console.log("start you???",entity)
  if (this.active)
  {
    console.log("Already in spawn mode, ignoring");
    return;
  }

  // 清理之前的状态
  if (this.obj) {
    this.finish(true);
  }

  this.callback = callback;
  this.obj = new THREE.Object3D();
  var mesh;
  
  // 获取基础模型名（移除数字后缀）
  var baseModelName = getBaseModelName(entity);
  
  // 初始化userData
  if (!this.obj.userData) {
    this.obj.userData = {};
  }
  
  var zOffsetAlreadyApplied = false; // 新增标志，标记z轴偏移是否已应用
  
  // 根据模型类型设置不同的模型类型和偏移量
  if (entity === 'box' || entity === 'sphere' || entity === 'cylinder' || 
      entity === 'pointlight' || entity === 'spotlight' || entity === 'directionallight') {
    // 简单模型
    this.obj.userData.modelType = 'easy';
    this.obj.userData.baseModelName = entity;
    
    // 简单模型默认偏移
    this.obj.userData.modelXOffset = 0;
    this.obj.userData.modelYOffset = 0;
    this.obj.userData.modelZOffset = 0.5; // 默认高度偏移
    
    if (entity === 'box')
    {
      mesh = this.scene.createBox(1, 1, 1);
      mesh.material = this.spawnedShapeMaterial;
    }
    else if (entity === 'sphere')
    {
      mesh = this.scene.createSphere(0.5);
      mesh.material = this.spawnedShapeMaterial;
    }
    else if (entity === 'cylinder')
    {
      mesh = this.scene.createCylinder(0.5, 1.0);
      mesh.material = this.spawnedShapeMaterial;
    }
    else if (entity === 'pointlight')
    {
      mesh = this.scene.createLight(1);
    }
    else if (entity === 'spotlight')
    {
      mesh = this.scene.createLight(2);
    }
    else if (entity === 'directionallight')
    {
      mesh = this.scene.createLight(3);
    }
  } else {
    // 判断是否为复合模型
    var isComplexModel = isCompositeName(baseModelName);
    
    if (isComplexModel) {
      // 复合模型
      this.obj.userData.modelType = 'complex';
      this.obj.userData.baseModelName = baseModelName;
      
      // 复合模型默认偏移
      this.obj.userData.modelXOffset = 0;
      this.obj.userData.modelYOffset = 0;
      this.obj.userData.modelZOffset = 0;
    } else {
      // 网格模型
      this.obj.userData.modelType = 'mesh';
      this.obj.userData.baseModelName = baseModelName;
      
      // 从模型配置获取偏移
      if (this.sdfParser) {
        // X轴偏移
        var xOffset = this.sdfParser.getModelXOffset ? 
          this.sdfParser.getModelXOffset(baseModelName) : 0;
        this.obj.userData.modelXOffset = xOffset;
        
        // Y轴偏移
        var yOffset = this.sdfParser.getModelYOffset ? 
          this.sdfParser.getModelYOffset(baseModelName) : 0;
        this.obj.userData.modelYOffset = yOffset;
        
        // Z轴偏移
        var zOffset = this.sdfParser.getModelZOffset(baseModelName);
        this.obj.userData.modelZOffset = zOffset;
        
        // 标记z轴偏移已应用，因为mesh模型在loadSDF中已经应用了偏移
        zOffsetAlreadyApplied = true;
        
        // 获取并保存默认缩放
        var defaultScale = this.sdfParser.getModelScale(baseModelName);
        this.obj.userData.defaultScale = defaultScale;
      }
    }
    
    mesh = this.sdfParser.loadSDF(entity);
  }

  this.obj.name = this.generateUniqueName(entity);
  this.obj.add(mesh);

  // temp model appears within current view
  var pos = new THREE.Vector2(window.window.innerWidth/2, window.innerHeight/2);
  var intersect = new THREE.Vector3();
  this.scene.getRayCastModel(pos, intersect);

  this.obj.position.x = intersect.x + (this.obj.userData.modelXOffset || 0);
  this.obj.position.y = intersect.y + (this.obj.userData.modelYOffset || 0);
  
  // 只有在z轴偏移尚未应用的情况下才应用z轴偏移
  if (!zOffsetAlreadyApplied) {
    this.obj.position.z = intersect.z + (this.obj.userData.modelZOffset || 0);
  } else {
    // mesh模型已经应用了偏移，直接使用intersect.z
    this.obj.position.z = intersect.z;
  }
  
  console.log("模型类型:", this.obj.userData.modelType);
  console.log("z偏移是否已应用:", zOffsetAlreadyApplied);
  console.log("this.obj.position.z:", this.obj.position.z);
  console.log("this.obj.userData.modelZOffset:", this.obj.userData.modelZOffset);
  
  this.scene.add(this.obj);
  
  // For the inserted light to have effect
  var allObjects = [];
  this.scene.scene.getDescendants(allObjects);
  for (var l = 0; l < allObjects.length; ++l)
  {
    if (allObjects[l].material)
    {
      allObjects[l].material.needsUpdate = true;
    }
  }

  // 事件监听与 startFromObject 一致
  var that = this;

  this.mouseDown = function(event) {that.onMouseDown(event);};
  this.mouseUp = function(event) {that.onMouseUp(event);};
  this.mouseMove = function(event) {that.onMouseMove(event);};
  this.keyDown = function(event) {that.onKeyDown(event);};
  this.touchMove = function(event) {that.onTouchMove(event,true);};
  this.touchEnd = function(event) {that.onTouchEnd(event);};

  this.domElement.addEventListener('mousedown', that.mouseDown, false);
  this.domElement.addEventListener('mouseup', that.mouseUp, false);
  this.domElement.addEventListener('mousemove', that.mouseMove, false);
  document.addEventListener('keydown', that.keyDown, false);

  this.domElement.addEventListener('touchmove', that.touchMove, false);
  this.domElement.addEventListener('touchend', that.touchEnd, false);

  this.active = true;
};

/**
 * Finish spawning an entity: re-enable camera controls,
 * remove listeners, remove temp object
 * @param {boolean} cancel - 是否为取消插入
 */
GZ3D.SpawnModel.prototype.finish = function(cancel)
{
  var that = this;

  // 移除所有事件监听
  this.domElement.removeEventListener('mousedown', that.mouseDown, false);
  this.domElement.removeEventListener('mouseup', that.mouseUp, false);
  this.domElement.removeEventListener('mousemove', that.mouseMove, false);
  document.removeEventListener('keydown', that.keyDown, false);
  this.domElement.removeEventListener('touchmove', that.touchMove, false);
  this.domElement.removeEventListener('touchend', that.touchEnd, false);

  // 只有取消时才移除对象
  if (cancel && this.obj) {
    this.scene.remove(this.obj);
  }
  
  // 重置所有状态
  this.obj = undefined;
  this.active = false;
  this.callback = undefined;
};

/**
 * Window event callback
 * @param {} event - not yet
 */
GZ3D.SpawnModel.prototype.onMouseDown = function(event)
{
  // Does this ever get called?
  // Change like this:
  // https://bitbucket.org/osrf/gzweb/pull-request/14
  event.preventDefault();
  event.stopImmediatePropagation();
};

/**
 * Window event callback
 * @param {} event - mousemove events
 */
GZ3D.SpawnModel.prototype.onMouseMove = function(event)
{
  if (!this.active)
  {
    return;
  }

  event.preventDefault();

  this.moveSpawnedModel(event.clientX,event.clientY);
};

/**
 * Window event callback
 * @param {} event - touchmove events
 */
GZ3D.SpawnModel.prototype.onTouchMove = function(event,originalEvent)
{
  if (!this.active)
  {
    return;
  }

  var e;

  if (originalEvent)
  {
    e = event;
  }
  else
  {
    e = event.originalEvent;
  }
  e.preventDefault();

  if (e.touches.length === 1)
  {
    this.moveSpawnedModel(e.touches[ 0 ].pageX,e.touches[ 0 ].pageY);
  }
};

/**
 * Window event callback
 * @param {} event - touchend events
 */
GZ3D.SpawnModel.prototype.onTouchEnd = function()
{
  if (!this.active)
  {
    return;
  }

  // 恢复材质透明度
  var restoreMaterial = function(object) {
    object.traverse(function(child) {
      if (child instanceof THREE.Mesh && child.material) {
        child.material.opacity = 1.0;
        child.material.transparent = false;
      }
    });
  };
  restoreMaterial(this.obj);

  this.callback(this.obj);
  this.finish();
};

/**
 * Window event callback
 * @param {} event - mousedown events
 */
GZ3D.SpawnModel.prototype.onMouseUp = function(event)
{
  if (!this.active)
  {
    return;
  }

  // 恢复材质透明度
  var restoreMaterial = function(object) {
    object.traverse(function(child) {
      if (child instanceof THREE.Mesh && child.material) {
        child.material.opacity = 1.0;
        child.material.transparent = false;
      }
    });
  };
  restoreMaterial(this.obj);

  this.callback(this.obj);
  this.finish();
};

/**
 * Window event callback
 * @param {} event - keydown events
 */
GZ3D.SpawnModel.prototype.onKeyDown = function(event)
{
  if ( event.keyCode === 27 ) // Esc
  {
    this.finish(true); // 取消插入，移除临时对象
  }
};

/**
 * Move temp spawned model
 * @param {integer} positionX - Horizontal position on the canvas
 * @param {integer} positionY - Vertical position on the canvas
 */
GZ3D.SpawnModel.prototype.moveSpawnedModel = function(positionX, positionY)
{
  var vector = new THREE.Vector3( (positionX / window.innerWidth) * 2 - 1,
        -(positionY / window.innerHeight) * 2 + 1, 0.5);
  vector.unproject(this.scene.camera);
  this.ray.set(this.scene.camera.position,
      vector.sub(this.scene.camera.position).normalize());
  var point = this.ray.intersectPlane(this.plane);

  if (!point)
  {
    return;
  }

  point.z = this.obj.position.z;

  if(this.snapDist)
  {
    point.x = Math.round(point.x / this.snapDist) * this.snapDist;
    point.y = Math.round(point.y / this.snapDist) * this.snapDist;
  }

  this.scene.setPose(this.obj, point, new THREE.Quaternion());

  if (this.obj.children[0].children[0] &&
     (this.obj.children[0].children[0] instanceof THREE.SpotLight ||
      this.obj.children[0].children[0] instanceof THREE.DirectionalLight))
  {
    var lightObj = this.obj.children[0].children[0];
    if (lightObj.direction)
    {
      if (lightObj.target)
      {
        lightObj.target.position.copy(lightObj.direction);
      }
    }
  }
};

/**
 * Generate unique name for spawned entity
 * @param {string} entity - entity type
 */
GZ3D.SpawnModel.prototype.generateUniqueName = function(entity)
{
  var i = 0;
  while (i < 1000)
  {
    if (this.scene.getByName(entity+'_'+i))
    {
      ++i;
    }
    else
    {
      return entity+'_'+i;
    }
  }
};

/**
 * 以自定义Object3D对象为基础，进入"鼠标放置"插入模式
 * @param {THREE.Object3D} obj
 * @param {function} callback
 */
GZ3D.SpawnModel.prototype.startFromObject = function(obj, callback)
{
  console.log("startfromobject???")
  if (this.active)
  {
    console.log("Already in spawn mode, ignoring");
    return;
  }

  // 清理之前的状态
  if (this.obj) {
    this.finish(true);
  }

  this.callback = callback;
  this.obj = obj;
  
  // 确保userData存在
  if (!this.obj.userData) {
    this.obj.userData = {};
  }
  
  var zOffsetAlreadyApplied = false; // 新增标志，标记z轴偏移是否已应用
  
  // 确定模型类型及相关属性
  if (!this.obj.userData.modelType) {
    // 检查是否为简单几何体
    var isEasyShape = determineIfEasyShape(obj);
    
    if (isEasyShape) {
      // 简单模型
      this.obj.userData.modelType = 'easy';
      this.obj.userData.baseModelName = obj.name.split('_')[0];
      
      // 简单模型默认偏移
      this.obj.userData.modelXOffset = 0;
      this.obj.userData.modelYOffset = 0;
      this.obj.userData.modelZOffset = 0.5; // 默认高度偏移
    } else {
      // 判断是否为复合模型
      var isComplexModel = isCompositeName(obj.name.split('_')[0]);
      
      if (isComplexModel) {
        // 复合模型
        this.obj.userData.modelType = 'complex';
        this.obj.userData.baseModelName = obj.name.split('_')[0];
        
        // 复合模型默认偏移
        this.obj.userData.modelXOffset = 0;
        this.obj.userData.modelYOffset = 0;
        this.obj.userData.modelZOffset = 0;
      } else {
        // 网格模型
        this.obj.userData.modelType = 'mesh';
        var baseModelName = obj.name.split('_')[0];
        this.obj.userData.baseModelName = baseModelName;
        
        // 从模型配置获取偏移
        if (this.sdfParser) {
          // X轴偏移
          var xOffset = this.sdfParser.getModelXOffset ? 
            this.sdfParser.getModelXOffset(baseModelName) : 0;
          this.obj.userData.modelXOffset = xOffset;
          
          // Y轴偏移
          var yOffset = this.sdfParser.getModelYOffset ? 
            this.sdfParser.getModelYOffset(baseModelName) : 0;
          this.obj.userData.modelYOffset = yOffset;
          
          // Z轴偏移
          var zOffset = this.sdfParser.getModelZOffset(baseModelName);
          this.obj.userData.modelZOffset = zOffset;
          
          // 标记z轴偏移已应用，导入的mesh模型已经应用了偏移
          zOffsetAlreadyApplied = true;
          
          // 获取并保存默认缩放
          var defaultScale = this.sdfParser.getModelScale(baseModelName);
          this.obj.userData.defaultScale = defaultScale;
        }
      }
    }
  } else if (this.obj.userData.modelType === 'mesh') {
    // 如果已经设置了modelType为mesh，则也认为z轴偏移已应用
    zOffsetAlreadyApplied = true;
  }

  // 递归唯一命名，避免多次导入name冲突
  function setUniqueName(obj, prefix) {
    obj.name = prefix + '_' + Date.now() + '_' + Math.floor(Math.random()*10000);
    obj.children.forEach(function(child, idx) {
      setUniqueName(child, obj.name + '_child' + idx);
    });
  }
  setUniqueName(this.obj, 'imported');

  // 放到视野中央
  var pos = new THREE.Vector2(window.innerWidth/2, window.innerHeight/2);
  var intersect = new THREE.Vector3();
  this.scene.getRayCastModel(pos, intersect);

  this.obj.position.x = intersect.x + (this.obj.userData.modelXOffset || 0);
  this.obj.position.y = intersect.y + (this.obj.userData.modelYOffset || 0);
  
  // 只有在z轴偏移尚未应用的情况下才应用z轴偏移
  if (!zOffsetAlreadyApplied) {
    this.obj.position.z = intersect.z + (this.obj.userData.modelZOffset || 0);
  } else {
    // mesh模型已经应用了偏移，直接使用intersect.z
    this.obj.position.z = intersect.z;
  }

  console.log('spawnFromSDF called, new object:', this.obj);
  console.log("模型类型:", this.obj.userData.modelType);
  console.log("z偏移是否已应用:", zOffsetAlreadyApplied);
  console.log("this.obj.position.z:", this.obj.position.z);
  console.log("this.obj.userData.modelZOffset:", this.obj.userData.modelZOffset);

  this.scene.add(this.obj);

  // 事件监听与 start 一致
  var that = this;
  this.mouseDown = function(event) {that.onMouseDown(event);};
  this.mouseUp = function(event) {that.onMouseUp(event);};
  this.mouseMove = function(event) {that.onMouseMove(event);};
  this.keyDown = function(event) {that.onKeyDown(event);};
  this.touchMove = function(event) {that.onTouchMove(event,true);};
  this.touchEnd = function(event) {that.onTouchEnd(event);};

  this.domElement.addEventListener('mousedown', that.mouseDown, false);
  this.domElement.addEventListener('mouseup', that.mouseUp, false);
  this.domElement.addEventListener('mousemove', that.mouseMove, false);
  document.addEventListener('keydown', that.keyDown, false);

  this.domElement.addEventListener('touchmove', that.touchMove, false);
  this.domElement.addEventListener('touchend', that.touchEnd, false);

  this.active = true;
};

/**
 * 判断对象是否为简单几何体
 * @param {THREE.Object3D} object - 要检测的对象
 * @returns {boolean} - 是否为简单几何体
 */
function determineIfEasyShape(object) {
  // 如果对象自身被标记为简单几何体
  if (object.userData && object.userData.modelType === 'easy') {
    return true;
  }
  
  // 根据名称判断
  if (object.name) {
    var name = object.name.toLowerCase();
    if (name.indexOf('box') >= 0 || 
        name.indexOf('sphere') >= 0 || 
        name.indexOf('cylinder') >= 0 || 
        name.indexOf('light') >= 0) {
      return true;
    }
  }
  
  // 检查是否是简单几何体
  var isSimpleShape = false;
  object.traverse(function(child) {
    if (child.geometry) {
      if (child.geometry instanceof THREE.BoxGeometry || 
          child.geometry instanceof THREE.SphereGeometry || 
          child.geometry instanceof THREE.CylinderGeometry) {
        isSimpleShape = true;
      }
    }
    
    // 检查是否是灯光
    if (child instanceof THREE.Light || 
        (child.children && child.children.length > 0 && child.children[0] instanceof THREE.Light)) {
      isSimpleShape = true;
    }
  });
  
  return isSimpleShape;
}

/**
 * 获取有效的基础模型名称，处理带数字后缀的情况
 * @param {string} entity - 模型名称，可能包含数字后缀
 * @returns {string} - 有效的基础模型名
 */
function getBaseModelName(entity) {
  // 删除最后一个下划线及其后面的数字
  // 匹配最后一个"_"后跟数字的部分
  return entity.replace(/_\d+$/, '');
}

/**
 * 检查模型名称是否为复合模型
 * @param {string} modelName - 模型名称
 * @returns {boolean} - 是否为复合模型
 */
function isCompositeName(modelName) {
  // 已知的复合模型列表
  var compositeModels = [
    'bookshelf', 'table', 'table_marble', 'chair',
    'cabinet', 'shelf', 'desk', 'simple_arm',
    'simple_arm_gripper', 'simple_gripper'
  ];
  
  // 检查是否在复合模型列表中
  for (var i = 0; i < compositeModels.length; i++) {
    if (modelName === compositeModels[i] || modelName.indexOf(compositeModels[i]) === 0) {
      return true;
    }
  }
  
  return false;
}
