const classFolderService = require('../services/classFolder.service');

function handleServiceError(err, res, next) {
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
  next(err);
}

exports.createFolder = async (req, res, next) => {
  try {
    const folder = await classFolderService.createFolder(req.user.id, req.params.classId, req.body.name);
    res.status(201).json({ folder });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

exports.getFolders = async (req, res, next) => {
  try {
    const result = await classFolderService.getFolders(req.user.id, req.params.classId);
    res.json(result);
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

exports.updateFolder = async (req, res, next) => {
  try {
    const folder = await classFolderService.updateFolder(req.user.id, req.params.classId, req.params.id, req.body);
    res.json({ folder });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

exports.deleteFolder = async (req, res, next) => {
  try {
    await classFolderService.deleteFolder(req.user.id, req.params.classId, req.params.id);
    res.json({ message: 'Folder deleted' });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

exports.updateMaterial = async (req, res, next) => {
  try {
    const material = await classFolderService.updateMaterial(req.user.id, req.params.classId, req.params.id, req.body);
    res.json({ material });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};

exports.deleteMaterial = async (req, res, next) => {
  try {
    await classFolderService.deleteMaterial(req.user.id, req.params.classId, req.params.id);
    res.json({ message: 'Material deleted' });
  } catch (err) {
    handleServiceError(err, res, next);
  }
};
