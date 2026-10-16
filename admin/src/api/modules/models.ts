import api from '../index';

export default {
  queryPackageModelOptions: () => api.get('models/packageModelOptions'),
  queryModels: (params: any) => api.get('models/query', { params }),
  setModels: (data: any) => api.post('models/setModel', data),
  delModels: (data: any) => api.post('models/delModel', data),
};
