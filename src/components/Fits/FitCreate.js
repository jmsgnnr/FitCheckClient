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
        site: ''
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
      .then(res => this.setState({ createdId: res.data.fit._id }))
      .then(() => msgAlert({
        heading: 'Created fit Succesfully',
        message: 'fit has been created successfully. Now viewing the fit.',
        variant: 'success'
      }))
      .catch(error => {
        msgAlert({
          heading: 'Failed to Create fit',
          message: 'Could not create fit with error: ' + error.message,
          variant: 'danger'
        })
      })
  }

  // when an input changes, update the state that corresponds with the input's name
  handleChange = event => {
    // in react, an event is actually a SyntheticEvent
    // to ensure the properties are not set to null after handleChange is finished
    // we must call event.persist
    event.persist()
    this.setState(state => {
      // return our state changge
      return {
        // set the fit state, to what it used to be (...state.fit)
        // but replace the property with `name` to its current `value`
        // ex. name could be `name` or `director`
        fit: { ...state.fit, [event.target.name]: event.target.value }
      }
    })
  }

  render () {
  // destructure our fits and createdId state
    const { fit, createdId } = this.state

    // if the fit has been created and we sits id
    if (createdId) {
      console.log(createdId)
      // redirect to the fits show page
      return <Redirect to={`/fits/${createdId}`} />
    }

    return (
      <div id='fitsDiv1'>
        <h3 className='fith3'>Create fit</h3>
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
