<?php

namespace App\Http\Controllers;

use App\Models\LiveCall;

class LiveCallController extends Controller
{
    public function index()
    {
        return view('admin.livecalls.index', [
            'calls' => LiveCall::orderBy('id', 'DESC')->get()
        ]);
    }
}
