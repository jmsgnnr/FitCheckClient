import React from 'react'

const MyFitsForm = ({ fit, handleSubmit, handleChange }) => (
  <form className="createFitForm" onSubmit={handleSubmit}>
    <h3>STORE A FIT</h3>
    <label>NAME</label>
    <input
      required
      placeholder='Enter name of fit'
      // this name should line up with the state we want to change
      name='name'
      defaultValue={fit.name}
      onChange={handleChange}
    />
    <label>BRAND</label>
    <input
      required
      placeholder='Enter brand'
      // this name should line up with the state we want to change
      name='brand'
      defaultValue={fit.brand}
      onChange={handleChange}
    />
    <label>SITE</label>
    <input
      required
      placeholder='Enter Site Found'
      // this name should line up with the state we want to change
      name='site'
      defaultValue={fit.site}
      onChange={handleChange}
    />
    <label>PHOTO</label>
    <input
      required
      placeholder='ENTER IMAGE URL'
      // this name should line up with the state we want to change
      name='photo'
      defaultValue={fit.photo}
      onChange={handleChange}
    />
    <div className='submitFit'>
      <button type='submit' className='submitBtn'>Submit</button>
    </div>
  </form>
)

export default MyFitsForm
