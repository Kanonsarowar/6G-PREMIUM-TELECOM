<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/admin/live-interrogation', function () {
    return view('admin.live-interrogation');
});

Route::get('/', function () {
    return redirect('/admin/live-interrogation');
});
use App\Http\Controllers\IvrController;

Route::prefix('admin')->group(function () {
    Route::get('/ivr', [IvrController::class, 'index']);
    Route::get('/ivr/create', [IvrController::class, 'create']);
    Route::post('/ivr/store', [IvrController::class, 'store']);
    Route::get('/ivr/edit/{id}', [IvrController::class, 'edit']);
    Route::post('/ivr/update/{id}', [IvrController::class, 'update']);
    Route::get('/ivr/delete/{id}', [IvrController::class, 'delete']);
});
require __DIR__.'/admin.php';
// ADD ROUTES HERE
