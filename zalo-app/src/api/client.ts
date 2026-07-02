import axios from 'axios';

const BASE_URL = 'https://your-bamso-backend.vercel.app/api'; // User will replace this with their actual URL

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const servicesApi = {
  getAll: async () => {
    const response = await apiClient.get('/services');
    return response.data;
  },
};

export const ticketsApi = {
  create: async (serviceId: string, customerName: string, phone: string) => {
    const response = await apiClient.post('/tickets', {
      serviceId,
      customerName,
      phone,
    });
    return response.data;
  },
  track: async (ticketId: string) => {
    const response = await apiClient.get(`/tickets/track?id=${ticketId}`);
    return response.data;
  },
};

export default apiClient;
