import apiUrl from '../apiConfig'
import axios from 'axios'

export const fitIndex = user => {
  return axios({
    url: apiUrl + '/my-fits',
    method: 'GET'
  })
}

export const fitCreate = (fit, user) => {
  return axios({
    url: apiUrl + '/my-fits',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${user.token}`
    },
    data: { fit: fit }
  })
}

export const fitShow = (id, user) => {
  return axios({
    url: apiUrl + '/my-fits/' + id,
    method: 'GET'
  })
}
