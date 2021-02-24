import React, { Component } from 'react'
import FitsForm from './FitsForm'
import { Redirect } from 'react-router-dom'
import { fitCreate } from '../../api/fits'

class FitCreate extends Component {
  constructor (props) {
    super(props)

    // initially our Fit states will be empty until they are filled in
    this.state = {
      fit: {
        name: '',
        brand: '',
        site: '',
        photo: ''
      },
      // createdId will be null, until we successfully create an fit
      createdId: null
    }
  }

  handleSubmit = event => {
    event.preventDefault()
    const { user, msgAlert } = this.props
    const { fit } = this.state

    // create an fit, pass it the fit data and the user for its token
    fitCreate(fit, user)
      // set the createdId to the id of the fit we just created
      .then(res => this.setState({ createdId: res.data.fit.id }))
      .then(() => msgAlert({
        heading: 'Created fit Succesfully',
        message: 'andrew was here',
        variant: 'success'
      }))
      .catch(error => {
        msgAlert({
          heading: 'Failed to Create fit',
          message: 'andrew wasnt here' + error.message,
          variant: 'danger'
        })
      })
  }

  // when an input changes, update the state that corresponds with the input's name
  handleChange = event => {
    event.persist()
    this.setState(state => {
      // return our state changge
      return {
        fit: { ...state.fit, [event.target.name]: event.target.value }
      }
    })
  }

  render () {
  // destructure our fits and createdId state
    const { fit, createdId } = this.state

    // if the fit has been created and we sits id
    if (createdId) {
      // redirect to the fits show page
      return <Redirect to='/fits/' />
    }

    return (
      <div id='fitsDiv1'>
        <FitsForm
          fit={fit}
          handleChange={this.handleChange}
          handleSubmit={this.handleSubmit}
        />
      </div>
    )
  }
}

export default FitCreate
