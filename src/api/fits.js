import apiUrl from '../apiConfig'
import axios from 'axios'

export const fitIndex = user => {
  return axios({
    url: apiUrl + '/fits',
    method: 'GET',
    headers: {
      // we need the user, so we have access to their token
      'Authorization': `Bearer ${user.token}`
    }
  })
}

export const fitCreate = (fit, user) => {
  return axios({
    url: apiUrl + '/fits',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${user.token}`
    },
    data: { fit: fit }
  })
}

export const fitShow = (id, user) => {
  return axios({
    url: apiUrl + '/fits/' + id,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${user.token}`
    }
  })
}
