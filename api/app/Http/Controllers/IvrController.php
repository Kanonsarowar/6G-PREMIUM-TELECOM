<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Ivr;

class IvrController extends Controller
{
    public function index()
    {
        $ivrs = Ivr::all();
        return view('admin.ivr.index', compact('ivrs'));
    }

    public function create()
    {
        return view('admin.ivr.create');
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required',
            'audio_file' => 'required',
            'options' => 'required'
        ]);

        Ivr::create($request->all());

        return redirect('/admin/ivr')->with('success', 'IVR created successfully');
    }

    public function edit($id)
    {
        $ivr = Ivr::findOrFail($id);
        return view('admin.ivr.edit', compact('ivr'));
    }

    public function update(Request $request, $id)
    {
        $ivr = Ivr::findOrFail($id);
        $ivr->update($request->all());

        return redirect('/admin/ivr')->with('success', 'IVR updated successfully');
    }

    public function delete($id)
    {
        $ivr = Ivr::findOrFail($id);
        $ivr->delete();

        return redirect('/admin/ivr')->with('success', 'IVR deleted');
    }
}
